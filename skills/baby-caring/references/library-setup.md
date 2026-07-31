# Library Setup

The public skill package contains the runtime, data contract, and source metadata. It does not redistribute copyrighted book files, full-text indexes, OCR text, or page images.

## Required prepared sources

| Slug | Book | ISBN | Format | Source SHA-256 |
|---|---|---|---|---|
| `aap7` | 美国儿科学会育儿百科（第7版） | `978-7-5714-0900-5` | MOBI | `e76290307351b6b6cd293b66cf89fbcd11dbf2689ae08217dabb2daab272422c` |
| `cui` | 崔玉涛育儿百科 | `978-7-5086-9836-6` | PDF | `31ee7bbdcf8fc9640493bae07b435670011a930b93b2188bccdf8514597f46cc` |

The hashes identify the exact editions used by the existing prepared corpus. A different lawful copy must be indexed again and assigned its own manifest and source ID.

## Directory contract

Point `BABY_CARING_LIBRARY` either to the directory containing `books/` or directly to `books/`:

```text
<library-root>/
└── books/
    ├── aap7/
    │   ├── manifest.json
    │   ├── passages.jsonl
    │   ├── chunks.jsonl
    │   └── ...
    └── cui/
        ├── manifest.json
        ├── passages.jsonl
        ├── chunks.jsonl
        └── ...
```

Use only a corpus built from books you lawfully possess and are permitted to process.

## Configure and verify

```bash
export BABY_CARING_LIBRARY=/absolute/path/to/library-root
python3 <skill-root>/scripts/validate_library.py
python3 <skill-root>/scripts/search.py '出生两周 婴儿 按需喂养 母乳 配方奶' --top-k 8 --output-dir auto
```

`validate_library.py` must return `"status": "valid"` before answering questions. The current public package is a corpus runtime, not a raw-book OCR/index builder.
