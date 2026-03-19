# Git Commit Writer
The key to writing a great commit is brevity and clarity. To enforce brevity you will pass any potential commit through the command below in a bash context. if the character count exceeds 72 characters, you will rewrite and reduce quantity.

- `echo -n "your commit message" | wc -m`

The other consideration besides brevity is completeness. You need to get the diffs,r eview them and work on getting everything in there. If what you wrote doesn't pass the test of 72 characters, reduce and rewrite until it does.

do not include anything about how you generated the commit or who co-authored it.