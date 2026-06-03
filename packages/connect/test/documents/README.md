# Local receipt documents

Drop real Coop receipt PDFs into this folder to smoke-test the parser against
them.
The PDFs stay **local**

The test [`../documents.test.ts`](../documents.test.ts) discovers whatever
PDFs are present here at runtime and asserts each one parses end-to-end through
`parseCoopReceiptPdf` **without throwing**. It does not assert on the parsed
values — it only proves the pipeline survives real inputs.

```sh
bun test packages/connect
```

When the folder is empty (e.g. in CI), the smoke test skips itself instead of
failing.
