const ts = require('typescript');
const fs = require('fs');
const path = 'src/pages/Simulator.jsx';
const program = ts.createProgram({
  rootNames: [path],
  options: {
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    checkJs: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    lib: ['ESNext', 'DOM'],
  },
});
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(JSON.stringify(diagnostics.map((d) => ({
  code: d.code,
  message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  file: d.file && d.file.fileName,
  pos: d.start,
  line: d.file && d.file.getLineAndCharacterOfPosition(d.start),
})), null, 2));
