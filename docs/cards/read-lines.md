# Read cited lines safely

## User story

As a consumer of retrieved chunks, I want `readLines(root, docPath, start, end)` and `citationLabel(chunk)` so that every citation can be checked against the real file.

## Acceptance criteria

1. Given a document with 4 lines, when I read lines 2 to 3, then I get exactly those two lines, both included.
2. Given a docPath that points outside the root, including `../wiki-evil/x.md` when the root is `/tmp/wiki`, when I call readLines, then it throws and reads nothing.
3. Given a docPath with shell metacharacters, when I call readLines, then no command runs and the call throws if the file does not exist.
4. Given a chunk with startLine 5 and endLine 7, when I build its label, then it is `wiki/guia.md#L5-L7`.
5. Given start greater than end, a start below 1, or a non-integer, when I call readLines, then it throws a RangeError.

## Out of scope

Binary files. Caching.
