# Benchmark fixtures

Add licensed, consented PNG/JPEG fixtures with these filenames before a paid run:

- `person-1.png` — vertical, clear face, hands or upper body visible
- `person-2.png` — clear identity reference suitable for reframing
- `product.png` — product photo with legible label
- `room.png` — wide interior containing a chair and floor lamp
- `poster.png` — vertical poster containing a headline plus other text

Use the same immutable files for every provider. Do not commit private real-person
images unless repository access and consent permit it. `--validate` fails closed if
any referenced fixture is absent, preventing a partial or unfair paid run.
