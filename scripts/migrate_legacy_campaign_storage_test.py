#!/usr/bin/env python3
"""Unit tests for the pure planning/rewrite logic of the phase-2 storage migration.

No network, no gcloud: the Firestore trees and bucket listings are injected.
Fixtures mirror the real shapes read out of production during the dry run.

  python3 scripts/migrate_legacy_campaign_storage_test.py
"""
import importlib.util
import os
import unittest
import urllib.parse

_spec = importlib.util.spec_from_file_location(
    "migrate_legacy_campaign_storage",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrate_legacy_campaign_storage.py"),
)
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)

SRC, DST = m.SRC_CAMPAIGN, m.DST_CAMPAIGN
CHEV = "ae4e6491-e684-41a0-9914-80818ed16982"
CHEV_PORTRAIT = f"{SRC}/characters/{CHEV}/portraits/1779926200704-ChevChelios2.webp"
CHEV_TOKEN = f"{SRC}/characters/{CHEV}/token-icons/1779926219087-ChevChelios2.webp"


def s(text):
    return {"stringValue": text}


def obj(path, md5="md5-a", token="tok-a", content_type="image/webp", size="27694"):
    meta = {"name": path, "size": size, "md5Hash": md5, "contentType": content_type}
    if token:
        meta["metadata"] = {m.DOWNLOAD_TOKEN_KEY: token}
    return meta


def download_url(path, token="tok-a"):
    return (f"https://firebasestorage.googleapis.com/v0/b/{m.BUCKET}/o/"
            f"{urllib.parse.quote(path, safe='')}?alt=media&token={token}")


def character(portrait=None, token_path=None, **extra):
    fields = {"name": s("Chev Chelios"), "ownerUserId": s("AvTfwKLu55QCksnkxGtZzFHdFTF2")}
    if portrait is not None:
        fields["portraitPath"] = s(portrait)
    icon = {"icon": s("custom"), "color": s("#bf2f2a"), "size": {"integerValue": "34"}}
    if token_path is not None:
        icon["customImagePath"] = s(token_path)
    fields["tokenIcon"] = {"mapValue": {"fields": icon}}
    fields.update(extra)
    return fields


def plan(migrated, legacy, legacy_objects, existing_new=None, no_restore=False):
    rewrites, skips = m.build_plan(migrated, legacy, no_restore)
    copies = m.classify_objects(rewrites, legacy_objects, existing_new or {})
    return rewrites, skips, copies


class ValueTreeTest(unittest.TestCase):
    def test_reads_and_writes_nested_map_leaves(self):
        fields = character(portrait="p", token_path="t")
        self.assertEqual(m.read_leaf(fields, ("tokenIcon", "customImagePath")), s("t"))
        m.write_leaf(fields, ("tokenIcon", "customImagePath"), "t2")
        self.assertEqual(fields["tokenIcon"]["mapValue"]["fields"]["customImagePath"], s("t2"))
        self.assertEqual(fields["tokenIcon"]["mapValue"]["fields"]["color"], s("#bf2f2a"))

    def test_creates_a_missing_nested_leaf_without_disturbing_siblings(self):
        fields = character(portrait="p")
        self.assertIsNone(m.read_leaf(fields, ("tokenIcon", "customImagePath")))
        m.write_leaf(fields, ("tokenIcon", "customImagePath"), "t")
        self.assertEqual(fields["tokenIcon"]["mapValue"]["fields"]["customImagePath"], s("t"))
        self.assertEqual(fields["tokenIcon"]["mapValue"]["fields"]["icon"], s("custom"))

    def test_walks_into_arrays(self):
        fields = {"inventory": {"arrayValue": {"values": [
            {"mapValue": {"fields": {"portraitPath": s("a")}}},
            {"mapValue": {"fields": {"portraitPath": s("b")}}},
        ]}}}
        found = {m.steps_label(steps): text for steps, text in m.doc_leaves(fields)}
        self.assertEqual(found, {"inventory[0].portraitPath": "a", "inventory[1].portraitPath": "b"})
        m.write_leaf(fields, ("inventory", 1, "portraitPath"), "b2")
        self.assertEqual(m.read_leaf(fields, ("inventory", 1, "portraitPath")), s("b2"))
        self.assertEqual(m.read_leaf(fields, ("inventory", 0, "portraitPath")), s("a"))

    def test_mask_stops_at_the_first_array_index(self):
        self.assertEqual(m.mask_for(("portraitPath",)), "portraitPath")
        self.assertEqual(m.mask_for(("tokenIcon", "customImagePath")), "tokenIcon.customImagePath")
        self.assertEqual(m.mask_for(("inventory", 3, "portraitPath")), "inventory")

    def test_mask_backtick_quotes_unusual_field_names(self):
        self.assertEqual(m.mask_for(("odd-name", "portraitPath")), "`odd-name`.portraitPath")


class ReferenceTypingTest(unittest.TestCase):
    def test_recognises_a_raw_legacy_path(self):
        path, rebuild = m.as_legacy_ref(CHEV_PORTRAIT)
        self.assertEqual(path, CHEV_PORTRAIT)
        self.assertEqual(rebuild("new/path"), "new/path")

    def test_recognises_a_legacy_download_url_and_keeps_its_query(self):
        url = download_url(CHEV_PORTRAIT)
        path, rebuild = m.as_legacy_ref(url)
        self.assertEqual(path, CHEV_PORTRAIT)
        rebuilt = rebuild(m.new_object_path(CHEV_PORTRAIT))
        self.assertIn(urllib.parse.quote(m.new_object_path(CHEV_PORTRAIT), safe=""), rebuilt)
        self.assertTrue(rebuilt.endswith("?alt=media&token=tok-a"))
        self.assertNotIn("237sg5HxL39dgZbZg9pQ", rebuilt)

    def test_ignores_values_that_are_not_legacy_references(self):
        for text in ("", "data:image/webp;base64,AAAA", f"{DST}/characters/x/portraits/y.webp",
                     download_url(f"{DST}/characters/x/portraits/y.webp"), "campaigns/other/x"):
            self.assertIsNone(m.as_legacy_ref(text)[0], text)

    def test_maps_a_legacy_object_path_into_the_group_scoped_tree(self):
        self.assertEqual(
            m.new_object_path(CHEV_PORTRAIT),
            f"{DST}/characters/{CHEV}/portraits/1779926200704-ChevChelios2.webp",
        )

    def test_pairs_path_fields_with_their_url_siblings(self):
        self.assertEqual(m.sibling_steps(("portraitPath",)), ("portraitPath"[:-4] + "Url",))
        self.assertEqual(m.sibling_steps(("tokenIcon", "customImagePath")),
                         ("tokenIcon", "customImageUrl"))
        self.assertIsNone(m.sibling_steps(("name",)))


class PlanTest(unittest.TestCase):
    def test_repoints_a_field_still_holding_the_legacy_path(self):
        doc = f"{DST}/characters/{CHEV}"
        rewrites, _, copies = plan(
            {DST: {}, doc: character(portrait=CHEV_PORTRAIT, token_path=CHEV_TOKEN)},
            {SRC: {}, f"{SRC}/characters/{CHEV}": character(portrait=CHEV_PORTRAIT, token_path=CHEV_TOKEN)},
            {CHEV_PORTRAIT: obj(CHEV_PORTRAIT), CHEV_TOKEN: obj(CHEV_TOKEN, md5="md5-b")},
        )
        self.assertEqual({r["action"] for r in rewrites}, {"REPOINT"})
        self.assertEqual({r["new"] for r in rewrites},
                         {m.new_object_path(CHEV_PORTRAIT), m.new_object_path(CHEV_TOKEN)})
        self.assertEqual(len(copies), 2)

    def test_restores_a_pointer_the_migrated_document_lost(self):
        """Chev Chelios: portraitPath cleared post-migration, legacy copy intact."""
        doc = f"{DST}/characters/{CHEV}"
        rewrites, _, _ = plan(
            {DST: {}, doc: character(portrait="", token_path=CHEV_TOKEN)},
            {SRC: {}, f"{SRC}/characters/{CHEV}": character(portrait=CHEV_PORTRAIT, token_path=CHEV_TOKEN)},
            {CHEV_PORTRAIT: obj(CHEV_PORTRAIT), CHEV_TOKEN: obj(CHEV_TOKEN, md5="md5-b")},
        )
        restore = next(r for r in rewrites if r["action"] == "RESTORE")
        self.assertEqual(restore["label"], "portraitPath")
        self.assertEqual(restore["new"], m.new_object_path(CHEV_PORTRAIT))

    def test_no_restore_flag_leaves_the_lost_pointer_alone(self):
        doc = f"{DST}/characters/{CHEV}"
        rewrites, skips, _ = plan(
            {DST: {}, doc: character(portrait="")},
            {SRC: {}, f"{SRC}/characters/{CHEV}": character(portrait=CHEV_PORTRAIT)},
            {CHEV_PORTRAIT: obj(CHEV_PORTRAIT)},
            no_restore=True,
        )
        self.assertEqual(rewrites, [])
        self.assertEqual([k for k, *_ in skips], ["no-restore"])

    def test_never_overwrites_a_pointer_already_in_the_new_tree(self):
        fresh = f"{DST}/characters/{CHEV}/portraits/1790000000000-new.webp"
        doc = f"{DST}/characters/{CHEV}"
        rewrites, skips, _ = plan(
            {DST: {}, doc: character(portrait=fresh)},
            {SRC: {}, f"{SRC}/characters/{CHEV}": character(portrait=CHEV_PORTRAIT)},
            {CHEV_PORTRAIT: obj(CHEV_PORTRAIT)},
        )
        self.assertEqual(rewrites, [])
        self.assertEqual([(k, label) for k, _doc, label, _d in skips], [("newer", "portraitPath")])

    def test_withholds_a_restore_when_the_url_sibling_holds_an_inline_image(self):
        doc = f"{DST}/characters/{CHEV}"
        rewrites, skips, _ = plan(
            {DST: {}, doc: character(portrait="", portraitUrl=s("data:image/webp;base64,AAAA"))},
            {SRC: {}, f"{SRC}/characters/{CHEV}": character(portrait=CHEV_PORTRAIT)},
            {CHEV_PORTRAIT: obj(CHEV_PORTRAIT)},
        )
        self.assertEqual(rewrites, [])
        self.assertEqual([k for k, *_ in skips], ["inline"])

    def test_blocks_a_rewrite_whose_source_object_is_gone(self):
        doc = f"{DST}/characters/{CHEV}"
        rewrites, _, copies = plan(
            {DST: {}, doc: character(portrait=CHEV_PORTRAIT)},
            {SRC: {}},
            {},
        )
        self.assertEqual(copies, {})
        self.assertEqual(len(rewrites), 1)
        self.assertIn("no longer exists", rewrites[0]["blocked"])

    def test_blocks_a_rewrite_whose_destination_holds_different_content(self):
        doc = f"{DST}/characters/{CHEV}"
        dst = m.new_object_path(CHEV_PORTRAIT)
        rewrites, _, copies = plan(
            {DST: {}, doc: character(portrait=CHEV_PORTRAIT)},
            {SRC: {}},
            {CHEV_PORTRAIT: obj(CHEV_PORTRAIT, md5="md5-a")},
            existing_new={dst: obj(dst, md5="md5-DIFFERENT")},
        )
        self.assertEqual(copies, {})
        self.assertIn("different content", rewrites[0]["blocked"])

    def test_treats_an_identical_destination_as_already_copied_and_still_repoints(self):
        doc = f"{DST}/characters/{CHEV}"
        dst = m.new_object_path(CHEV_PORTRAIT)
        rewrites, _, copies = plan(
            {DST: {}, doc: character(portrait=CHEV_PORTRAIT)},
            {SRC: {}},
            {CHEV_PORTRAIT: obj(CHEV_PORTRAIT)},
            existing_new={dst: obj(dst)},
        )
        self.assertEqual(copies[CHEV_PORTRAIT]["state"], "already copied")
        self.assertIsNone(rewrites[0]["blocked"])
        self.assertEqual(rewrites[0]["new"], dst)

    def test_blocks_a_url_rewrite_when_the_source_has_no_download_token(self):
        doc = f"{DST}/characters/{CHEV}"
        rewrites, _, _ = plan(
            {DST: {}, doc: character(portraitUrl=s(download_url(CHEV_PORTRAIT)))},
            {SRC: {}},
            {CHEV_PORTRAIT: obj(CHEV_PORTRAIT, token=None)},
        )
        self.assertIn(m.DOWNLOAD_TOKEN_KEY, rewrites[0]["blocked"])

    def test_copies_a_shared_object_once_and_repoints_every_reference(self):
        char_doc = f"{DST}/characters/{CHEV}"
        token_doc = f"{DST}/maps/map-1/tokens/tok-1"
        rewrites, _, copies = plan(
            {DST: {},
             char_doc: character(token_path=CHEV_TOKEN),
             token_doc: {"tokenImagePath": s(CHEV_TOKEN)}},
            {SRC: {}},
            {CHEV_TOKEN: obj(CHEV_TOKEN)},
        )
        self.assertEqual(len(copies), 1)
        self.assertEqual(len(rewrites), 2)
        self.assertTrue(all(r["new"] == m.new_object_path(CHEV_TOKEN) for r in rewrites))

    def test_only_ever_targets_migrated_documents(self):
        rewrites, _, _ = plan(
            {DST: {}, f"{DST}/characters/{CHEV}": character(portrait="")},
            {SRC: {}, f"{SRC}/characters/{CHEV}": character(portrait=CHEV_PORTRAIT)},
            {CHEV_PORTRAIT: obj(CHEV_PORTRAIT)},
        )
        self.assertTrue(rewrites)
        for r in rewrites:
            self.assertTrue(r["doc"].startswith(DST))
            self.assertTrue(r["new"].startswith(m.NEW_PREFIX) or m.points_at_new_tree(r["new"]))


class WriteBuildingTest(unittest.TestCase):
    def test_two_rewrites_in_one_field_both_survive(self):
        """Regression: seeding the top-level field per rewrite dropped earlier edits."""
        doc = f"{DST}/characters/{CHEV}"
        migrated = {doc: character(token_path=CHEV_TOKEN,
                                   **{"portraitPath": s(CHEV_PORTRAIT)})}
        migrated[doc]["tokenIcon"]["mapValue"]["fields"]["customImageUrl"] = s(
            download_url(CHEV_TOKEN))
        rewrites, _ = m.build_plan(migrated, {}, False)
        m.classify_objects(rewrites, {CHEV_TOKEN: obj(CHEV_TOKEN), CHEV_PORTRAIT: obj(CHEV_PORTRAIT)}, {})
        (rel, fields, masks), = m.build_writes(migrated, rewrites)

        self.assertEqual(rel, doc)
        self.assertEqual(sorted(masks),
                         ["portraitPath", "tokenIcon.customImagePath", "tokenIcon.customImageUrl"])
        icon = fields["tokenIcon"]["mapValue"]["fields"]
        self.assertEqual(icon["customImagePath"], s(m.new_object_path(CHEV_TOKEN)))
        self.assertNotIn("237sg5HxL39dgZbZg9pQ", icon["customImageUrl"]["stringValue"])
        self.assertEqual(fields["portraitPath"], s(m.new_object_path(CHEV_PORTRAIT)))

    def test_the_payload_never_mutates_the_scanned_document(self):
        doc = f"{DST}/characters/{CHEV}"
        migrated = {doc: character(portrait=CHEV_PORTRAIT, token_path=CHEV_TOKEN)}
        rewrites, _ = m.build_plan(migrated, {}, False)
        m.classify_objects(rewrites, {CHEV_TOKEN: obj(CHEV_TOKEN), CHEV_PORTRAIT: obj(CHEV_PORTRAIT)}, {})
        m.build_writes(migrated, rewrites)
        self.assertEqual(migrated[doc]["portraitPath"], s(CHEV_PORTRAIT))
        self.assertEqual(m.read_leaf(migrated[doc], ("tokenIcon", "customImagePath")), s(CHEV_TOKEN))

    def test_a_restored_field_absent_from_the_document_is_created(self):
        doc = f"{DST}/characters/{CHEV}"
        migrated = {DST: {}, doc: character()}
        legacy = {SRC: {}, f"{SRC}/characters/{CHEV}": character(portrait=CHEV_PORTRAIT)}
        rewrites, _ = m.build_plan(migrated, legacy, False)
        m.classify_objects(rewrites, {CHEV_PORTRAIT: obj(CHEV_PORTRAIT)}, {})
        writes = m.build_writes(migrated, rewrites)
        (rel, fields, masks), = writes
        self.assertEqual(masks, ["portraitPath"])
        self.assertEqual(fields, {"portraitPath": s(m.new_object_path(CHEV_PORTRAIT))})

    def test_an_array_leaf_is_masked_by_its_whole_field(self):
        doc = f"{DST}/characters/{CHEV}"
        migrated = {doc: {"inventory": {"arrayValue": {"values": [
            {"mapValue": {"fields": {"name": s("Torch")}}},
            {"mapValue": {"fields": {"portraitPath": s(CHEV_PORTRAIT)}}},
        ]}}}}
        rewrites, _ = m.build_plan(migrated, {}, False)
        m.classify_objects(rewrites, {CHEV_PORTRAIT: obj(CHEV_PORTRAIT)}, {})
        (_rel, fields, masks), = m.build_writes(migrated, rewrites)
        self.assertEqual(masks, ["inventory"])
        values = fields["inventory"]["arrayValue"]["values"]
        self.assertEqual(values[0]["mapValue"]["fields"]["name"], s("Torch"))
        self.assertEqual(values[1]["mapValue"]["fields"]["portraitPath"],
                         s(m.new_object_path(CHEV_PORTRAIT)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
