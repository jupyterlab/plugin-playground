const fs = require('fs');
const path = require('path');
const ts = require('typescript');

/*
 * The boot script must run before the application reads the page config, so
 * it cannot be a module of the extension. The `remoteEntry` script is the only
 * file of a federated extension that the bootstrap runs that early.
 */
const preboot = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, 'src', 'preboot.ts'), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018
    }
  }
).outputText;

module.exports = {
  module: {
    noParse: [require.resolve('typescript/lib/typescript.js')]
  },
  resolve: {
    fallback: {
      module: false,
      perf_hooks: false
    }
  },
  plugins: [
    {
      apply: compiler => {
        new compiler.webpack.BannerPlugin({
          banner: `(function (exports) {\n${preboot}\nexports.applyStoredProfile();\n})({});`,
          raw: true,
          test: /remoteEntry\.[^/]*\.js$/
        }).apply(compiler);
      }
    }
  ]
};
