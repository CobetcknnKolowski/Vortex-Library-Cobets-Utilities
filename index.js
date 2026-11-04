// Vortex Library - Cobet's Utilities-v1.0.5
// Importing required libraries
const path = require('path');
const {actions,fs,log,selectors,} = require('vortex-api');
const React = require('react');

// Filename used for mod metadata files
const MODINFO_FILENAME = 'modinfo.json';

// Vortex Specific Attribute keys not written to modinfo.json. Game extensions can add to this via modMetadataExcludeAttributes.
const BASE_EXCLUDED_ATTRIBUTE_KEYS = ['bugMessage','color','downloadGame','fileMD5','fileName','fileSize','installTime','installerChoices','modSize','updatedTimestamp','uploadedTimestamp',];
const gameExcludedAttributeKeys = {};

//	/*	// Function, registerExcludedAttributeKeys v1
function registerExcludedAttributeKeys(gameId, attributeKeys) {
	if (typeof gameId !== 'string' || gameId === '')
		{log('warn', 'Mod Metadata: Ignored excluded-attribute registration with an invalid gameId', {gameId,}); return;}
	if (!Array.isArray(attributeKeys))
		{log('warn', 'Mod Metadata: Ignored excluded-attribute registration with an invalid attributeKeys array', {gameId,}); return;}
	const existing = gameExcludedAttributeKeys[gameId] || [];
	const merged = Array.from(new Set([...existing,...attributeKeys,]));
	gameExcludedAttributeKeys[gameId] = merged;
	log('info', 'Mod Metadata: Registered game-specific excluded attribute keys', {gameId,addedKeys: attributeKeys,totalExcludedCount: merged.length,});
}
//	*/	// Function, registerExcludedAttributeKeys v1

//	/*	// Function, getExcludedAttributeKeys v1
function getExcludedAttributeKeys(gameId) {
	const gameKeys = gameExcludedAttributeKeys[gameId] || [];
	const combined = new Set([...BASE_EXCLUDED_ATTRIBUTE_KEYS,...gameKeys,]);
	combined.delete('rules'); // never let an exclusion list accidentally swallow the rules array
	return Array.from(combined);
}
//	*/	// Function, getExcludedAttributeKeys v1

//	/*	// Function, getModAttributeString v1
function getModAttributeString(mod, attributeName) {
	if (!mod || typeof mod !== 'object' || !mod.attributes || typeof mod.attributes !== 'object')
		{return '';}
	const value = mod.attributes[attributeName];
	if (value === undefined || value === null)
		{return '';}
	return String(value);
}
//	*/	// Function, getModAttributeString v1

//	/*	// Function, cleanModMetadataFolderName v1, Strip parenthetical/brace decoration from a mod's folder name for the nested Mod Metadata subfolder
function cleanModMetadataFolderName(modName) {
	const cleaned = modName.replace(/[(][^)]*[)]|[{][^}]*[}]/g,'').replace(/\s{2,}/g,' ').trim();
	return cleaned === '' ? modName : cleaned;
}
//	*/	// Function, cleanModMetadataFolderName v1

//	/*	// Function, getModInfoInstallInstructions v1, Produce the modinfo.json staging instruction for an archive and hand the remaining files back to the caller
function getModInfoInstallInstructions(files, destinationPath) {
	const modName = cleanModMetadataFolderName(path.basename(destinationPath,'.installing'));
	const contentFiles = files.filter((file) => !file.endsWith('/') && !file.endsWith('\\'));
	const modInfoFile = contentFiles.find((file) => path.basename(file).toLowerCase() === MODINFO_FILENAME);
	const instructions = [];
	if (modInfoFile !== undefined) {
		const stagedDestination = path.join('Mod Metadata',modName,MODINFO_FILENAME);
		instructions.push({type: 'copy',source: modInfoFile,destination: stagedDestination,});
		log('info', 'Mod Metadata: Staging modinfo.json during install', {modName,modInfoFile,stagedDestination,});
	}
	const remainingFiles = modInfoFile === undefined ? contentFiles : contentFiles.filter((file) => file !== modInfoFile);
	log('info', 'Mod Metadata: Prepared modinfo staging instructions', {modName,modInfoStaged: modInfoFile !== undefined,remainingFileCount: remainingFiles.length,});
	return {instructions,remainingFiles,modName,};
}
//	*/	// Function, getModInfoInstallInstructions v1

//	/*	// Function, getModInfoPath v2
function getModInfoPath(context, gameId, modId) {
    const state = context.api.getState();
    const mods = state.persistent.mods?.[gameId];
    if (mods === undefined)
		{log('warn', 'Mod Metadata: No mods found for game', {gameId,modId,}); return undefined;}
    const mod = mods[modId];
    if (mod === undefined)
		{log('warn', 'Mod Metadata: Installed mod could not be found', {gameId,modId,}); return undefined;}

    if (mod.installationPath === undefined)
		{log('warn', 'Mod Metadata: Mod has no installation path', {gameId,modId,modName: mod.attributes?.modName,}); return undefined;}
    const stagingPath = selectors.installPathForGame(state, gameId);
    if (stagingPath === undefined)
		{log('warn', 'Mod Metadata: Vortex staging path could not be determined', {gameId,modId,}); return undefined;}
    const modPath = path.join(stagingPath,mod.installationPath);
    const modName = cleanModMetadataFolderName(path.basename(mod.installationPath));
    const modInfoPath = path.join(modPath,'Mod Metadata',modName,MODINFO_FILENAME);
    log('info', 'Mod Metadata: Resolved modinfo.json path', {gameId,modId,stagingPath,installationPath: mod.installationPath,modName,modInfoPath,});
    return modInfoPath;
}
//	*/	// Function, getModInfoPath v2

//	/*	// Function, getRuleComparisonKey v1, Build an identity key for a rule so equivalent rules compare equal. Ignores decoration such as idHint.
// logicalFileName is included (empty when absent) so 'conflicts' rules that key off it still compare correctly.
function getRuleComparisonKey(rule) {
	const reference = rule && typeof rule.reference === 'object' && rule.reference !== null ? rule.reference : {};
	return JSON.stringify([
		rule && typeof rule.type === 'string' ? rule.type : '',
		typeof reference.fileExpression === 'string' ? reference.fileExpression : '',
		typeof reference.logicalFileName === 'string' ? reference.logicalFileName : '',
		typeof reference.versionMatch === 'string' ? reference.versionMatch : '*',
	]);
}
//	*/	// Function, getRuleComparisonKey v1

//	/*	// Function, applyModInfoRules v3, Make the Vortex store rules reflect the rules array of a modinfo file.
// Normal mode: add only rules that are not already present (compared by getRuleComparisonKey).
// replaceRules mode: NO comparison. Dump every store rule, then rebuild the list fresh from the file, in file order.
function applyModInfoRules(context, gameId, modId, modInfo, replaceRules) {
	// Step 0: Decide whether there is anything to do. A missing rules array never changes anything; an empty array only matters in replace mode (it means "clear all").
	if (!Array.isArray(modInfo.rules))
		{log('debug', 'Mod Metadata: modinfo.json has no rules array; store rules left untouched', {gameId,modId,replaceRules,}); return;}
	if (modInfo.rules.length === 0 && !replaceRules)
		{return;}
	if (typeof actions.addModRule !== 'function' || typeof actions.removeModRule !== 'function')
		{log('error', 'Mod Metadata: Vortex does not expose addModRule/removeModRule; rules were not applied', {gameId,modId,}); return;}
	const getStoreMod = () => context.api.getState().persistent.mods?.[gameId]?.[modId];
	const getStoreRules = () => { const storeMod = getStoreMod(); return storeMod && Array.isArray(storeMod.rules) ? storeMod.rules : []; };
	const modName = getStoreMod()?.attributes?.name || modId;
	const storeRulesBefore = [...getStoreRules()];
	// Step 1: Validate incoming rules.
	const incomingRules = [];
	for (const rule of modInfo.rules) {
		if (rule === null || typeof rule !== 'object' || typeof rule.type !== 'string' || rule.reference === null || typeof rule.reference !== 'object')
			{log('warn', 'Mod Metadata: Skipping invalid rule entry in modinfo.json', {gameId,modId,rule,}); continue;}
		incomingRules.push(rule);
	}
	log('debug', 'Mod Metadata: Rule application starting', {gameId,modId,replaceRules,storeRuleCount: storeRulesBefore.length,incomingRuleCount: incomingRules.length,});
	// Step 2 (replace mode only): Dump the entire store rules list. No comparison, nothing is kept.
	let removedCount = 0;
	if (replaceRules) {
		for (const storeRule of storeRulesBefore) {
			context.api.store.dispatch(actions.removeModRule(gameId,modId,storeRule,));
			removedCount++;
			log('debug', 'Mod Metadata: Removed store rule during replace', {gameId,modId,storeRule,});
		}
		// Dispatches are synchronous, so the store can be checked immediately.
		const remainingRules = getStoreRules();
		if (remainingRules.length > 0)
			{
				log('warn', 'Mod Metadata: Rules were not fully cleared before rebuilding; rule order may be wrong', {gameId,modId,remainingRuleCount: remainingRules.length,});
				log('debug', 'Mod Metadata: Store rules that survived the clear', {gameId,modId,remainingRules,});
			}
	}
	// Step 3: Add rules. Replace mode adds every incoming rule as-is; normal mode skips rules already in the store.
	const knownKeys = replaceRules ? null : new Set(getStoreRules().map(getRuleComparisonKey));
	let addedCount = 0;
	let skippedCount = 0;
	for (const rule of incomingRules) {
		if (knownKeys !== null) {
			const key = getRuleComparisonKey(rule);
			if (knownKeys.has(key))
				{skippedCount++; continue;}
			knownKeys.add(key);
		}
		context.api.store.dispatch(actions.addModRule(gameId,modId,rule,));
		addedCount++;
	}
	// Step 4: Report the REAL store count, read back after the dispatches.
	const finalRules = getStoreRules();
	log('info', 'Mod Metadata: Applied modinfo.json rules to Vortex', {gameId,modId,replaceRules,removedCount,addedCount,skippedCount,storeRuleCountBefore: storeRulesBefore.length,storeRuleCountAfter: finalRules.length,});
	log('debug', 'Mod Metadata: Rule application detail', {gameId,modId,storeRulesBefore,storeRulesAfter: finalRules,});
	// Step 5 (replace mode only): Verify the store now holds exactly the file's rules, and tell the user.
	if (replaceRules) {
		const expectedCount = incomingRules.length;
		const matches = finalRules.length === expectedCount;
		if (!matches) {log('warn', 'Mod Metadata: Rules rebuilt but the store count does not match modinfo.json', {gameId,modId,expectedCount,actualCount: finalRules.length,});}
		if (matches)
			{log('info', 'Mod Metadata: Rules rebuilt from modinfo.json', {gameId,modId,modName,ruleCount: finalRules.length,});}
		else
			{context.api.sendNotification({id: `mod-metadata-replace-rules-${modId}`,type: 'warning',message: `Mod: ${modName}, rules rebuilt but count mismatch (${finalRules.length} of ${expectedCount})`,displayMS: 5000,});}
	}
}
//	*/	// Function, applyModInfoRules v3

//	/*	// Function, readModInfo v1
async function readModInfo(context, gameId, modId, options) {
    // options.replaceRules === true: make the store's rules match modinfo.json exactly (see applyModInfoRules)
    const replaceRules = options !== undefined && options !== null && options.replaceRules === true;
    const modInfoPath = getModInfoPath(context,gameId,modId);
    if (modInfoPath === undefined) {return;}
    let data;
    try {data = await fs.readFileAsync(modInfoPath,{encoding: 'utf8',});}
    catch (err) {
        if (err.code === 'ENOENT')
            {log('info', 'Mod Metadata: No modinfo.json found', {gameId,modId,modInfoPath,}); return;}
        log('error', 'Mod Metadata: Failed to read modinfo.json', {gameId,modId,modInfoPath,errorCode: err.code,errorMessage: err.message,});
        throw err;
    }
    let modInfo;
    try {modInfo = JSON.parse(data);}
    catch (parseError) {
        log('error', 'Mod Metadata: Failed to parse modinfo.json', {gameId,modId,modInfoPath,errorMessage: parseError.message,});
        throw parseError;
    }
    if (modInfo === null || typeof modInfo !== 'object' || Array.isArray(modInfo)) {
        const error = new Error('modinfo.json must contain a JSON object');
        log('error', 'Mod Metadata: Invalid modinfo.json structure', {gameId,modId,modInfoPath,valueType: Array.isArray(modInfo) ? 'array' : typeof modInfo,});
        throw error;
    }
    const state = context.api.getState();
    const mod = state.persistent.mods?.[gameId]?.[modId];
    if (mod === undefined)
        {log('warn', 'Mod Metadata: Mod disappeared before metadata could be applied', {gameId,modId,modInfoPath,}); return;}

    // If category_title is missing but category (an ID) is present, resolve the title from the game's synced category list
    if ((modInfo.category_title === undefined || modInfo.category_title === null || modInfo.category_title === '') && modInfo.category !== undefined && modInfo.category !== null && modInfo.category !== '') {
        const categoryId = String(modInfo.category).trim();
        const gameCategories = state.persistent.categories?.[gameId];
        const matchedCategory = gameCategories !== undefined ? gameCategories[categoryId] : undefined;
        if (matchedCategory !== undefined && matchedCategory.name !== undefined && matchedCategory.name !== null && matchedCategory.name !== '')
            {modInfo.category_title = matchedCategory.name; log('info', 'Mod Metadata: Resolved category_title from category ID', {gameId,modId,categoryId,categoryTitle: modInfo.category_title,});}
        else
            {log('warn', 'Mod Metadata: Could not resolve category_title for category ID', {gameId,modId,categoryId,});}
    }

    const existingAttributes = mod.attributes || {};
    const modInfoWithoutRules = {...modInfo,};
    delete modInfoWithoutRules.rules;
    const updatedAttributes = {...existingAttributes,...modInfoWithoutRules,};
    const metadataKeys = Object.keys(modInfoWithoutRules);

    log('info', 'Mod Metadata: Applying metadata attributes', {gameId,modId,modInfoPath,metadataKeys,metadataKeyCount: metadataKeys.length,});
    context.api.store.dispatch(actions.setModAttributes(gameId,modId,updatedAttributes));
    log('info', 'Mod Metadata: Metadata attributes applied successfully', {gameId,modId,updatedKeys: metadataKeys,});
	applyModInfoRules(context,gameId,modId,modInfo,replaceRules,);
}
//	*/	// Function, readModInfo v1

//	/*	// Function, writeModInfo v2
async function writeModInfo(context, gameId, modId, modInfo) {
    if (modInfo === null || typeof modInfo !== 'object' || Array.isArray(modInfo)) {
        const error = new Error('modInfo must be a JSON object');
        log('error', 'Mod Metadata: Refused to write invalid metadata', {gameId,modId,valueType: Array.isArray(modInfo)? 'array': typeof modInfo,});
        throw error;
    }
    const modInfoPath = getModInfoPath(context,gameId,modId);
    if (modInfoPath === undefined)
        {throw new Error('Unable to determine modinfo.json path');}
    const excludedKeys = getExcludedAttributeKeys(gameId);
    const filteredModInfo = {...modInfo,};
    for (const excludedKey of excludedKeys) {delete filteredModInfo[excludedKey];}
    const sortedKeys = Object.keys(filteredModInfo).sort((left, right) => left.localeCompare(right));
    const sortedModInfo = {};
    for (const key of sortedKeys) {sortedModInfo[key] = filteredModInfo[key];}
    const metadataDirectory = path.dirname(modInfoPath);
    log('info', 'Mod Metadata: Preparing to write modinfo.json', {gameId,modId,modInfoPath,metadataDirectory,metadataKeys: sortedKeys,metadataKeyCount: sortedKeys.length,excludedKeyCount: excludedKeys.length,});
    try {await fs.ensureDirAsync(metadataDirectory);}
    catch (mkdirError) {
        log('error', 'Mod Metadata: Failed to create metadata directory', {gameId,modId,metadataDirectory,errorCode: mkdirError.code,errorMessage: mkdirError.message,});
        throw mkdirError;
    }
    const jsonData = JSON.stringify(sortedModInfo,null,2);
    try {await fs.writeFileAsync(modInfoPath,jsonData,{encoding: 'utf8',});}
    catch (writeError) {
        log('error', 'Mod Metadata: Failed to write modinfo.json', {gameId,modId,modInfoPath,errorCode: writeError.code,errorMessage: writeError.message,});
        throw writeError;
    }
    log('info', 'Mod Metadata: modinfo.json written successfully', {gameId,modId,modInfoPath,metadataKeys: sortedKeys,metadataKeyCount: sortedKeys.length,});
    return modInfoPath;
}
//	*/	// Function, writeModInfo v2

//	/*	// Function, testModInfoSupported v1
function testModInfoSupported(files, gameId) {
    const supported = files.some((file) => path.basename(file).toLowerCase() === MODINFO_FILENAME);
    log('info', 'Mod Metadata: Installer support test complete', {gameId,supported,});
    return Promise.resolve({supported,requiredFiles: [],});
}
//	*/	// Function, testModInfoSupported v1

//	/*	// Function, installModInfo v2, Fallback installer: stage modinfo.json, deploy everything else to the game root
function installModInfo(files, destinationPath) {
	const staged = getModInfoInstallInstructions(files, destinationPath);
	const instructions = [...staged.instructions,...staged.remainingFiles.map((file) => ({type: 'copy',source: file,destination: file,})),];
	log('info', 'Mod Metadata: Install instructions generated (library fallback installer)', {modName: staged.modName,fileCount: instructions.length,});
	return Promise.resolve({instructions,});
}
//	*/	// Function, installModInfo v2

//	/*	// Function, RulesTableEditor v4, Editable rules table rendered inside the mod details panel (includes createRuleRow)
// Columns: Type, fileExpression, logicalFileName, idHint, versionMatch. The table scrolls sideways inside a fixed-width wrapper, so it never widens the details panel.
function RulesTableEditor(props) {
	const context = props.context;
	const gameId = props.gameId;
	const mod = props.mod;
	const modId = mod.id;
	// Helper, createRuleRow: Flatten one rule into row state, one field per table column. Missing fields become ''.
	const createRuleRow = (rule) => {
		const reference = rule && typeof rule === 'object' && rule.reference && typeof rule.reference === 'object' ? rule.reference : {};
		const asText = (value) => typeof value === 'string' ? value : '';
		return {
			type: rule && typeof rule.type === 'string' ? rule.type : 'requires',
			fileExpression: asText(reference.fileExpression),
			logicalFileName: asText(reference.logicalFileName),
			idHint: asText(reference.idHint),
			versionMatch: typeof reference.versionMatch === 'string' ? reference.versionMatch : '*',
		};
	};
	const currentRulesJson = JSON.stringify(Array.isArray(mod.rules) ? mod.rules : []);
	const lastAppliedRulesRef = React.useRef(currentRulesJson);
	const [rows, setRows] = React.useState(() => (Array.isArray(mod.rules) ? mod.rules : []).map(createRuleRow));
	React.useEffect(() => {
		if (currentRulesJson !== lastAppliedRulesRef.current) {
			lastAppliedRulesRef.current = currentRulesJson;
			setRows((Array.isArray(mod.rules) ? mod.rules : []).map(createRuleRow));
		}
	}, [currentRulesJson]);

	const commitRules = (newRows) => {
		// A row needs at least one identifying field (fileExpression, logicalFileName, or idHint) to become a rule.
		// Only non-empty fields are written into the reference, so no per-type special casing is needed.
		const newRules = newRows
			.filter((row) => [row.fileExpression, row.logicalFileName, row.idHint].some((value) => value.trim() !== ''))
			.map((row) => {
				const reference = {};
				for (const field of ['fileExpression', 'logicalFileName', 'idHint']) {
					if (row[field].trim() !== '') {reference[field] = row[field].trim();}
				}
				reference.versionMatch = row.versionMatch.trim() === '' ? '*' : row.versionMatch.trim();
				return {type: row.type,reference,};
			});
		log('debug', 'Mod Metadata: Rules table rows converted to rules', {gameId,modId,rows: newRows,rules: newRules,});
		const state = context.api.getState();
		const currentMod = state.persistent.mods?.[gameId]?.[modId];
		const existingRules = currentMod && Array.isArray(currentMod.rules) ? currentMod.rules : [];
		const newRuleStrings = newRules.map((rule) => JSON.stringify(rule));
		const existingRuleStrings = existingRules.map((rule) => JSON.stringify(rule));
		const rulesToRemove = existingRules.filter((rule) => !newRuleStrings.includes(JSON.stringify(rule)));
		const rulesToAdd = newRules.filter((rule) => !existingRuleStrings.includes(JSON.stringify(rule)));
		for (const rule of rulesToRemove)
			{context.api.store.dispatch(actions.removeModRule(gameId,modId,rule,));}
		for (const rule of rulesToAdd)
			{context.api.store.dispatch(actions.addModRule(gameId,modId,rule,));}
		lastAppliedRulesRef.current = JSON.stringify(newRules);
		log('info', 'Mod Metadata: Rules list updated from the mod details panel', {gameId,modId,removedCount: rulesToRemove.length,addedCount: rulesToAdd.length,totalRuleCount: newRules.length,});
		const currentAttributes = currentMod && currentMod.attributes ? currentMod.attributes : {};
		writeModInfo(context,gameId,modId,{...currentAttributes,rules: newRules,},).catch((err) => {
			log('warn', 'Mod Metadata: Rules were updated in Vortex but could not be saved to modinfo.json', {gameId,modId,errorMessage: err.message,});
			log('debug', 'Mod Metadata: modinfo.json rules persist failure detail', {gameId,modId,errorCode: err.code,stack: err.stack,});
			context.api.sendNotification({type: 'warning',message: `Mod: ${currentAttributes.name || modId}, rules changed but modinfo.json was not updated`,displayMS: 5000,});
		});
	};
	// Change one field of one row. Runs on every keystroke, so it only updates local state; the rules are committed on blur (handleTextBlur).
	const updateRow = (index, field, value) => {setRows((currentRows) => currentRows.map((row, rowIndex) => rowIndex === index ? {...row,[field]: value,} : row));};
	const handleTypeChange = (index, value) => {
		setRows((currentRows) => {
			const updatedRows = currentRows.map((row, rowIndex) => rowIndex === index ? {...row,type: value,} : row);
			commitRules(updatedRows);
			return updatedRows;
		});
	};
	const handleTextBlur = () => {commitRules(rows);};
	const removeRow = (index) => {
		setRows((currentRows) => {
			const updatedRows = currentRows.filter((row, rowIndex) => rowIndex !== index);
			commitRules(updatedRows);
			return updatedRows;
		});
	};
	// New rows use createRuleRow so they always have every column field (type, fileExpression, logicalFileName, idHint, versionMatch).
	const addRow = () => {setRows((currentRows) => [...currentRows,createRuleRow({}),]);};
	const cellStyle = {border: '1px solid #ccc',padding: '4px',whiteSpace: 'nowrap',};
	const inputStyle = {width: '100%',boxSizing: 'border-box',};
	// Text columns, in table order. minWidth keeps each input usable; when they no longer fit the panel, the table scrolls sideways instead of squeezing them.
	const textColumns = [
		{field: 'fileExpression',minWidth: '160px',},
		{field: 'logicalFileName',minWidth: '140px',},
		{field: 'idHint',minWidth: '110px',},
		{field: 'versionMatch',minWidth: '90px',},
	];
	// Width the rules table reports to the side panel's layout, whatever its content (same approach as the SPT extension's Source Code table).
	// The wrapper reports a FIXED width (contain: inline-size), so a wide table can never widen the panel; it fills the panel's width and scrolls horizontally inside it.
	const reportedWidthPx = 300;
	return React.createElement('div',{},
		React.createElement('div',{style: {width: '100%',overflowX: 'auto',contain: 'inline-size',containIntrinsicInlineSize: `${reportedWidthPx}px`,marginBottom: '8px',},},
			React.createElement('table',{style: {width: '100%',borderCollapse: 'collapse',marginBottom: '0',},className: 'table table-bordered',},
				React.createElement('thead',{},
					React.createElement('tr',{},
						React.createElement('th',{style: cellStyle,},'Type',),
						...textColumns.map((column) => React.createElement('th',{key: column.field,style: cellStyle,},column.field,)),
						React.createElement('th',{style: cellStyle,},'',),
					),
				),
				React.createElement('tbody',{},
					...rows.map((row, index) => React.createElement('tr',{key: index,},
						React.createElement('td',{style: cellStyle,},
							React.createElement('select',{style: {...inputStyle,minWidth: '100px',},value: row.type,onChange: (event) => handleTypeChange(index,event.target.value,),},
								React.createElement('option',{value: 'requires',},'requires',),
								React.createElement('option',{value: 'after',},'after',),
								React.createElement('option',{value: 'before',},'before',),
								React.createElement('option',{value: 'conflicts',},'conflicts',),
							),
						),
						...textColumns.map((column) =>
							React.createElement('td',{key: column.field,style: cellStyle,},
								React.createElement('input',{type: 'text',style: {...inputStyle,minWidth: column.minWidth,},value: row[column.field],onChange: (event) => updateRow(index,column.field,event.target.value,),onBlur: handleTextBlur,}),
							)),
						React.createElement('td',{style: {...cellStyle,textAlign: 'center',},},React.createElement('button',{type: 'button',className: 'btn btn-danger btn-xs',onClick: () => removeRow(index),},'X',),),
					)),
				),
			),
		),
		React.createElement('button',{type: 'button',className: 'btn btn-default btn-xs',onClick: addRow,},'Add Row',),
	);
}
//	*/	// Function, RulesTableEditor v4

//	/*	// Function, GenerateModinfoButton v1, Writes a modinfo.json for this mod from its current live attributes and rules
function GenerateModinfoButton(props) {
	const context = props.context;
	const gameId = props.gameId;
	const mod = props.mod;
	const modId = mod.id;
	const [status, setStatus] = React.useState('idle');

	const handleClick = async () => {
		setStatus('working');
		try {
			const state = context.api.getState();
			const currentMod = state.persistent.mods?.[gameId]?.[modId];
			const currentAttributes = currentMod && currentMod.attributes && typeof currentMod.attributes === 'object' ? currentMod.attributes : {};
			const currentRules = currentMod && Array.isArray(currentMod.rules) ? currentMod.rules : [];
			await writeModInfo(context,gameId,modId,{...currentAttributes,rules: currentRules,},);
			setStatus('success');
			log('info', 'Mod Metadata: Generated modinfo.json from current mod attributes', {gameId,modId,});
		}
		catch (err) {
			setStatus('error');
			log('error', 'Mod Metadata: Failed to generate modinfo.json from current mod attributes', {gameId,modId,errorMessage: err.message,});
		}
	};

	const label = status === 'working' ? 'Generating...' : status === 'success' ? 'Generated!' : status === 'error' ? 'Failed - Retry' : 'Generate Modinfo File';
	return React.createElement('button',{type: 'button',className: 'btn btn-default btn-xs',onClick: handleClick,disabled: status === 'working',},label,);
}
//	*/	// Function, GenerateModinfoButton v1

//	/*	// Function, init v1
function init(context) {
    context.registerAPI('modMetadataRead',(gameId, modId, options) => readModInfo(context, gameId, modId, options),{minArguments: 2,});
    context.registerAPI('modMetadataWrite',(gameId, modId, modInfo) => writeModInfo(context, gameId, modId, modInfo),{minArguments: 3,});
    context.registerAPI('modMetadataExcludeAttributes',(gameId, attributeKeys) => registerExcludedAttributeKeys(gameId, attributeKeys),{minArguments: 2,});
	context.registerAPI('modMetadataInstallInstructions',(files, destinationPath) => getModInfoInstallInstructions(files, destinationPath),{minArguments: 2,});
	context.registerInstaller('mod-metadata-installer',50,testModInfoSupported,installModInfo);
	// Vortex Default Attribute: 'pictureUrl', position: 10,
	// Vortex Default Attribute: 'name', position: 25,
	// Vortex Default Attribute: 'author', position: 50,
	// Vortex Default Attribute: 'fileName', position: 60,
	// Vortex Attribute: 'logicalFileName', position: 61
	context.registerTableAttribute('mods', {id: 'mod-metadata-logical-file-name',name: 'Logical File Name (Vortex Grouping ID)',
		description: 'The Vortex grouping value for this mod.',
		icon: 'tag',
		placement: 'detail',
		calc: (mod) => getModAttributeString(mod,'logicalFileName'),
		edit: {readOnly: () => false,placeholder: () => 'Enter the Vortex grouping value.',onChangeValue: (mod, newValue) => {
				const value = newValue === undefined || newValue === null ? '' : String(newValue).trim();
				context.api.store.dispatch(actions.setModAttribute(selectors.activeGameId(context.api.getState()),mod.id,'logicalFileName',value,),);
		},},
		position: 61,
	});
	// Vortex Default Attribute: 'version', position: 70,
	// Vortex Default Attribute: 'variant', position: 90,
	context.registerTableAttribute('mods', {id: 'mod-metadata-variant',name: 'Variant',
		description: 'The variant/compatibility identifier for this specific mod file.',
		icon: 'code-branch',
		placement: 'table',
		calc: (mod) => getModAttributeString(mod,'variant'),
		isToggleable: true,
		isDefaultVisible: false,
		isSortable: true,
		edit: {
			readOnly: () => false,
			placeholder: () => 'Enter the variant value.',
			onChangeValue: (mod, newValue) => {
				const value = newValue === undefined || newValue === null ? '' : String(newValue).trim();
				context.api.store.dispatch(actions.setModAttribute(selectors.activeGameId(context.api.getState()),mod.id,'variant',value,),);
			},
		},
		position: 90,
	});
	// Vortex Custom Attribute: 'Rules List', position: 90.05
	context.registerTableAttribute('mods', {id: 'mod-metadata-rules-editor',name: 'Rules List',
		description: 'This mod\'s dependency/conflict rules.',
		icon: 'plug',
		placement: 'detail',
		calc: (mod) => Array.isArray(mod.rules) ? mod.rules : [],
		customRenderer: (mod) => React.createElement(RulesTableEditor,{context,gameId: selectors.activeGameId(context.api.getState()),mod,}),
		edit: {readOnly: () => false,},
		position: 90.05,
	});
	// Vortex Default Attribute: 'category', position: >99 ,
	// Vortex Default Attribute: 'type', position: >99 ,
	// Vortex Default Attribute: 'source', position: >99 ,
	// Vortex Default Attribute: 'url', position: >99 ,
	context.registerTableAttribute('mods', {id: 'mod-metadata-generate-file',name: 'Generate Modinfo File',
		description: 'Write a modinfo.json for this mod using its current attributes and rules.',
		icon: 'refresh',
		placement: 'detail',
		calc: (mod) => '',
		customRenderer: (mod) => React.createElement(GenerateModinfoButton,{context,gameId: selectors.activeGameId(context.api.getState()),mod,}),
		edit: {},
		position: 92,
	});
    context.once(() => {
        context.api.events.on(
            'did-install-mod',
            (gameId, archiveId, modId) => {
                log('info', 'Mod Metadata: Mod installation completed', {gameId,archiveId,modId,});
                readModInfo(context, gameId, modId).catch((err) => {log('error', 'Mod Metadata: Failed to process installed mod metadata', {gameId,archiveId,modId,errorCode: err.code,errorMessage: err.message,});});
            }
        );
        log('info', 'Mod Metadata: Extension initialized');
    });
    return true;
}
//	*/	// Function, init v1
module.exports = {default: init,};