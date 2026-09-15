# Third-party notices

The UI refresh adapts selected interaction components from
[`starc007/ui-components`](https://github.com/starc007/ui-components):

- `animated-sidebar`
- `bouncy-accordion`
- `bottom-sheet`
- `number-ticker`
- `button-base`
- `checkbox`
- `input`
- `radio`
- `select`
- `switch`
- `tabs`
- `wheel-picker`

## ui-components

MIT License

Copyright (c) 2026 Saurabh Chauhan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Windows desktop companion

- Electron — Electron contributors, MIT. https://github.com/electron/electron
- ONNX Runtime — Microsoft Corporation, MIT. https://github.com/microsoft/onnxruntime
- sharp — Lovell Fuller and contributors, Apache-2.0; bundled libvips and related dependency notices are included by their packages. https://github.com/lovell/sharp
- fflate — Arjun Barrett, MIT. https://github.com/101arrowz/fflate. Used only for local ZIP action-pack import and example packaging; its license is included in the installed dependency.
- U²-Net / U²-NetP — Xuebin Qin and contributors, Apache-2.0. https://github.com/xuebinqin/U-2-Net
  The unmodified U²-NetP ONNX model is distributed from https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx and verified against SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`. Its license is included in `apps/desktop/assets/U2NET-LICENSE.txt` and in the Windows app's assets. Model inference and image decoding run locally. The implementation follows the model's documented ImageNet normalization and foreground-mask output convention.
- The v2 default pet sprite atlas was generated for MoneyDance using the built-in image generation tool. Its prompt and asset provenance are recorded in `docs/design/desktop-pet-v2.md`. The acting timelines and photo-scene SVG illustrations are project-authored. The original v1 cat SVG is retained only as an image-processing test fixture.
- The action-pack template repacks the existing v2 artwork into fixed frame canvases. This does not call an image generation service. Imported user action packs retain their original authorship; MoneyDance supplies local decoding, playback and state bindings only.
