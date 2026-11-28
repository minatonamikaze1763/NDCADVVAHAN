# NDC Smart Scan — Customer Autofill

This is an independent customer-information extraction module. It does not import or call the existing document auto-cropper.

## Asset setup

From the repository root:

```sh
cd upload/smart-scan
npm ci
npm run setup-assets
```

The setup script copies the Tesseract.js browser bundle, worker, matching core runtime/WASM, English traineddata and PDF.js module/worker from npm packages into `assets/`. Generated files are ignored by Git. Do not commit generated OCR binaries or language data.

Dependencies are pinned in this folder's `package.json`. Tesseract and PDF processing run in the employee's browser; documents and recognized text are not sent to the server.

## Hosting

The public site must serve `/upload/smart-scan/assets/` same-origin. The Pages workflow in `.github/workflows/deploy-smart-scan-pages.yml` installs these dependencies and packages generated assets into the Pages artifact. Configure the repository's Pages source as **GitHub Actions** once before the first deployment. This deployment contains the existing site plus the generated Smart Scan assets.

For manual static hosting, run the commands above and deploy the entire repository root, including the generated `upload/smart-scan/assets` directory.

## Privacy review

OCR is not identity verification. Before production use, review Aadhaar handling against UIDAI rules and applicable Indian privacy/data-protection requirements, and confirm the dealership's lawful basis, consent wording, access controls and retention policy. Do not use real identity documents in automated tests.
