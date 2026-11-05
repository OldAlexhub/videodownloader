// Generate the instrumentation asset from the actual shipped detector, never a test copy.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, filename);
const {MEDIA_DETECTOR_SCRIPT, WEBSITE_AD_BLOCKER_SCRIPT} = require('../src/utils/browser.ts');
const output = path.resolve(__dirname, '../android/app/build/generated/qaAssets');
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'detector.js'), MEDIA_DETECTOR_SCRIPT);
fs.writeFileSync(path.join(output, 'blocker.js'), WEBSITE_AD_BLOCKER_SCRIPT);
