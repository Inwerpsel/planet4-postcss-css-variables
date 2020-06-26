const  shallowEqualObjects = require( "shallow-equal/objects");
const fs = require('fs');
const glob = require('glob');
const balancedVar = require( './balanced-var' );

const grabVars = ( value ) => {
    let remainingVariableValue = value;
    let match;
    const lineVars = [];

    while ( (match = balancedVar( remainingVariableValue )) ) {
        // Split at the comma to find variable name and fallback value
        // There may be other commas in the values so this isn't necessarily just 2 pieces
        const arguments = match.body.split( ',' ).map( str => str.trim() );

        const [variableName, ...defaultValue] = arguments;

        lineVars.push( {
            name: variableName,
            defaultValue: defaultValue.join(),
        } );

        remainingVariableValue = (match.pre || '') + match.body.replace( variableName, '' ) + (match.post || '');
    }

    return lineVars;
}

function scssVarUsages( sourceDir ) {
    // Store values as we iterate
    const allVars = {};

    const scssFiles = glob.sync(`${sourceDir.replace(/\/$/, '')}/**/*.scss`);
    // Create an array of all the *.module.SCSS files and loop through it
    scssFiles.forEach((file) => {
        // Read the file, convert to string and then split each line
        const scssLines = fs.readFileSync(file).toString().split('\n');

        let lineNumber = 1;

        scssLines.forEach( line => {
            lineNumber++;
            const cssValueRgx = /^\s*([\w\-]+): (.*)/;
            const declarationParts = cssValueRgx.exec( line );
            if ( declarationParts === null ) {
                return;
            }
            const [, property, value] = declarationParts;

            const lineVars = grabVars( value ).map( cssVar => ({
                file,
                lineNumber,
                property,
                ...cssVar,
            }) );

            lineVars.forEach( cssVar => {
                const { name, ...usage } = cssVar;
                if ( !allVars[ name ] ) {
                    allVars[ name ] = {
                        usages: [],
                    };
                }
                if ( ! allVars[ name ].usages.some( existingUsage => shallowEqualObjects( existingUsage, usage ) ) ) {
                    allVars[ name ].usages.push( usage );
                }
            } );
        });
    });

    return allVars;
}

module.exports = scssVarUsages;
