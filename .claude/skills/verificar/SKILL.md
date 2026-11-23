---
name: verificar
description: Runs the independent verificador subagent on the current work against a work item card. Run it yourself with /verificar before pushing to main, merging or opening a pull request.
argument-hint: <card-path> [base-ref]
disable-model-invocation: true
allowed-tools: Agent(verificador) Read Bash(git symbolic-ref *) Bash(git merge-base *)
---

Verify the current branch with the `verificador` subagent.

1. Card: the first argument (`$0`). If it is missing, list `docs/cards/` and ask which one. Stop there.
2. Base ref: the second argument if given; otherwise run
   `git merge-base HEAD "$(git symbolic-ref --short refs/remotes/origin/HEAD)"` and use the hash.
   If that hash is HEAD itself (the work is already on `main` and pushed), the diff would be empty:
   stop and ask for the base ref, for example the commit before the work started.
3. Launch the `verificador` subagent. Its prompt must contain ONLY:
   `Card: <path>. Base: <ref>. Verify the diff of the current branch.`
   Do not add what you or the user did in this session, what you believe works, or which files
   matter. The verifier must reach its conclusion from the repository alone.
4. Show its report verbatim. After it, add at most three lines: which criteria need a test, which
   findings look real, what you would do next. Do not change the verdict and do not edit code.
