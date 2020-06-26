const mergeVarUsages = ( inCss, inScss ) => Object.keys( inCss ).map( cssVar => ({
    ...inCss[ cssVar ],
    sourceUsages: ! inScss[ cssVar ] ? null : inScss[ cssVar ].usages,
}));

module.exports = mergeVarUsages;
