Slide 1: Large Project Power Moves

Get feedback on the plan

Ask another Claude for a lean plan with minimal edits

Ask a third Claude to decide between them

Save each to markdown

Have a 4th Claude review all plans

Slide 2: Multi-Stage Execution

*"My developer just finished step 2 and I want to make sure they did a good job. Can you review their work?

I want this to be really clean, readable code, DRY, and look for opportunities where it should have edited existing code rather than adding new code."*

Slide 3: The "My Developer" Trick

Open new tab → /resume →

*"My developer wrote up this plan. Give me feedback on it – high level and down to the nitty gritty.

How can we improve it? Are there any big architectural changes we should make?"*

Claude prefers critiquing "my developer"

Slide 4: My Default Planning Prompt

Make a detailed plan to accomplish this. Think hardest.

How will we implement only the functionality we need right now?

Identify files that need to be changed.

Do not include plans for legacy fallback unless required or explicitly requested.

Write a short overview of what you are about to do.
Write function names and 1–3 sentences about what they do.
Write test names and 5–10 words about behavior to cover.

Slide 5: Multi-Stage Execution (repeat)

*"My developer just finished step 2 and I want to make sure they did a good job. Can you review their work?

I want this to be really clean, readable code, DRY, and look for opportunities where it should have edited existing code rather than adding new code."*

Slide 6: My Default Execute Prompt

Now think hard and write elegant code that completes this.

Do not add backwards compatibility unless explicitly requested.

After every code block you write, lint, compile, and write corresponding tests and run them before writing the next code block.

Slide 7: For Simple Tasks

Skip all the ceremony:

Please look at the github issue, read related code and docs, and work on it.

Be sure to verify and test the issue when you are complete.

Close the issue when you are done.

Slide 8: The Three-Step Process

EXPLORE 🔍

PLAN 📋

EXECUTE 🚀

Slide 9: Developer

Create this pull request.

Once you've completed it, look at the next pull request in this project.

Someone else will be working on it.

Give the next developer some advice to help them accomplish the next PR in the markdown file.

Slide 10: Ready?

When Claude’s plan looks like it’s building for Fortune 500:

Is this implementation overly complex?

We are still pre-customer – any unnecessary fallbacks, unnecessary versioning, testing overkill in this?