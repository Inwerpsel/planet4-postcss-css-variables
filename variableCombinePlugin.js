const fs = require('fs');
const mergeVarUsages = require('./lib/merge-var-usages');

module.exports = ({allCssVars, filename}) => ( {
        apply: (compiler) => {
            compiler.hooks.done.tap('DoneWriteCssVars', () => {
                const vars = Object.entries(allCssVars).reduce((vars, [, fileVars]) => {
                    Object.entries(fileVars).forEach(([k, v]) => {
                        if (!vars[k]) {
                            vars[k] = {name: k, usages: []};
                        }
                        vars[k].usages.push(...( v.usages || [] ));
                    });

                    return vars;
                }, {});
                fs.writeFile(
                    `${filename || 'css-variables.json'}`,
                    JSON.stringify(mergeVarUsages(vars, {}), null, 2),
                    err => !!err && console.log('ERROR writing file', err)
                );
            });
        }
    }
);
