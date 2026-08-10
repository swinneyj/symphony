// Type shim for the optional local-TTS dependency (kokoro-js). The real
// types ship with the package when installed; this keeps tsc green when the
// worker is built without it. Runtime import is dynamic + guarded.
declare module "kokoro-js";
