const balancedVar = require( './balanced-var' );
const cloneSpliceParentOntoNodeWhen = require( './clone-splice-parent-onto-node-when' );
const findNodeAncestorWithSelector = require( './find-node-ancestor-with-selector' );
const gatherVariableDependencies = require( './gather-variable-dependencies' );
const generateScopeList = require( './generate-scope-list' );
const isNodeUnderScope = require( './is-node-under-scope' );

// Regexp to capture variable names
const RE_VAR_FUNC = (/var\(\s*(--[^,\s)]+)/);

// Pass in a CSS property value to parse/resolve and a map of available variable values
// and we can figure out the final value
//
// `ignorePseudoScope`: Optional bool to determine whether the scope resolution should be left alone or not
//
// Note: We do not modify the declaration
// Note: Resolving a declaration value without any `var(...)` does not harm the final value.
//		This means, feel free to run everything through this function
const resolveValue = ( decl, map, { ignorePseudoScope = false, _debugIsInternal = false, collectVar: collectVar } = {} ) => {
	const debugIndent = _debugIsInternal ? '\t' : '';

	let remainingVariableValue = String( decl.value );
	let resultantValue = remainingVariableValue;
	let warnings = [];
	// Match all variables first so we can later on if there are circular dependencies
	let variablesUsedInValueMap = {};
	let match = undefined;

	// Use balanced lib to find var() declarations and store variable names
	while ( (match = balancedVar( remainingVariableValue )) ) {
		// Split at the comma to find variable name and fallback value
		// There may be other commas in the values so this isn't necessarily just 2 pieces
		const arguments = match.body.split( ',' ).map( str => str.trim() );

		const [variableName, ...defaultValue] = arguments;

		if ( typeof collectVar === 'function' ) {
			collectVar( {
				name: variableName,
				usage: {
					selector: decl.parent.selector,
					property: decl.prop,
					defaultValue: defaultValue.join(),
				},
			} );
		}

		// add variable found in the object
		variablesUsedInValueMap[variableName] = true;

		// Replace variable name (first occurrence only) from result, to avoid circular loop
		remainingVariableValue = (match.pre || '') + match.body.replace( variableName, '' ) + (match.post || '');
	}

	const variablesUsedInValue = Object.keys( variablesUsedInValueMap );

	//console.log(debugIndent, (_debugIsInternal ? '' : 'Try resolving'), generateScopeList(decl.parent, true), `ignorePseudoScope=${ignorePseudoScope}`, '------------------------');

	// Resolve any var(...) substitutons
	var isResultantValueUndefined = false;

	// var() = var( <custom-property-name> [, <any-value> ]? )
	// matches `name[, fallback]`, captures "name" and "fallback"
	// See: http://dev.w3.org/csswg/css-variables/#funcdef-var
	while ( (match = balancedVar( resultantValue )) ) {
		var matchingVarDeclMapItem = undefined;

		// Split at the comma to find variable name and fallback value
		// There may be other commas in the values so this isn't necessarily just 2 pieces
		var variableFallbackSplitPieces = match.body.split( ',' );

		// Get variable name and fallback, filtering empty items
		var variableName = variableFallbackSplitPieces[ 0 ].trim();
		var fallback = variableFallbackSplitPieces.length > 1 ? variableFallbackSplitPieces.slice( 1 ).join( ',' ).trim() : undefined;

		(map[ variableName ] || []).forEach( function ( varDeclMapItem ) {
			// Make sure the variable declaration came from the right spot
			// And if the current matching variable is already important, a new one to replace it has to be important
			var isRoot = varDeclMapItem.parent.type === 'root' || varDeclMapItem.parent.selectors[ 0 ] === ':root';

			var underScope = isNodeUnderScope( decl.parent, varDeclMapItem.parent );
			var underScsopeIgnorePseudo = isNodeUnderScope( decl.parent, varDeclMapItem.parent, ignorePseudoScope );

			//console.log(debugIndent, 'isNodeUnderScope', underScope, underScsopeIgnorePseudo, generateScopeList(varDeclMapItem.parent, true), varDeclMapItem.decl.value);

			if (
				underScsopeIgnorePseudo &&
				// And if the currently matched declaration is `!important`, it will take another `!important` to override it
				(!(matchingVarDeclMapItem || {}).isImportant || varDeclMapItem.isImportant)
			) {
				matchingVarDeclMapItem = varDeclMapItem;
			}
		} );

		// Default to the calculatedInPlaceValue which might be a previous fallback, then try this declarations fallback
		var replaceValue = (matchingVarDeclMapItem || {}).calculatedInPlaceValue || (function () {
			// Resolve `var` values in fallback
			var fallbackValue = fallback;
			if ( fallback ) {
				var fallbackDecl = decl.clone( { parent: decl.parent, value: fallback } );
				fallbackValue = resolveValue( fallbackDecl, map, { _debugIsInternal: true } ).value;
			}

			return fallbackValue;
		})();
		// Otherwise if the dependency health is good(no circular or self references), dive deeper and resolve
		if ( matchingVarDeclMapItem !== undefined && !gatherVariableDependencies( variablesUsedInValue, map ).hasCircularOrSelfReference ) {
			// Splice the declaration parent onto the matching entry

			var varDeclScopeList = generateScopeList( decl.parent.parent, true );
			var innerMostAtRuleSelector = varDeclScopeList[ 0 ].slice( -1 )[ 0 ];
			var nodeToSpliceParentOnto = findNodeAncestorWithSelector( innerMostAtRuleSelector, matchingVarDeclMapItem.decl.parent );
			// See: `test/fixtures/cascade-with-calc-expression-on-nested-rules`
			var matchingMimicDecl = cloneSpliceParentOntoNodeWhen( matchingVarDeclMapItem.decl, decl.parent.parent, function ( ancestor ) {
				return ancestor === nodeToSpliceParentOnto;
			} );

			replaceValue = resolveValue( matchingMimicDecl, map, {_debugIsInternal: true} ).value;
		}

		isResultantValueUndefined = replaceValue === undefined;
		if ( isResultantValueUndefined ) {
			warnings.push( ['variable ' + variableName + ' is undefined and used without a fallback', { node: decl }] );
		}

		// Replace original declaration with found value
		resultantValue = (match.pre || '') + replaceValue + (match.post || '');
	}

	return {
		// The resolved value
		value: !isResultantValueUndefined ? resultantValue : undefined,
		// Array of variable names used in resolving this value
		variablesUsed: variablesUsedInValue,
		// Any warnings generated from parsing this value
		warnings: warnings
	};
};

resolveValue.RE_VAR_FUNC = RE_VAR_FUNC;


module.exports = resolveValue;
