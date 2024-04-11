const moduleId = 'pf2e-sustain-reminder';
const susainedEffectPrefix = 'Sustaining: ';

const useChatSetting = 'useChat';
const usePopupSetting = 'usePopup';

Hooks.on('init', () => {
	/*
	game.settings.register(moduleId, usePopupSetting, {
		name: 'Use popup',
		hint: 'Reminds about sustained spells via popup.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});
	*/
	game.settings.register(moduleId, useChatSetting, {
		name: 'Use chat',
		hint: 'Reminds about sustained spells via chat.',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});
	
});

// Creating a reminder effect
Hooks.on('createChatMessage', async (message, options, userId) => {
	if (userId != game.user.id) return;
	if (!isSpell(message)) return;
	
	const { token, actor } = message;
	
	const spellId = getSpellId(message);
	if (!spellId) return;
	
	const spell = getSpell(actor, spellId);
	if (!spell) return;
	
	if (!isSpellSustained(spell)) return;
	
	const reminderEffect = createReminderEffect(spell);
	if(!doesTokenContainEffectOfTheSameName(token, reminderEffect)) {
		const effectItems = await token.actor.createEmbeddedDocuments('Item', [reminderEffect]);
	}
});

// Showing the reminder
Hooks.on('pf2e.startTurn', async (combatant, encounter, userId) => {
	const { token, actor } = combatant;
	const sustainedEffects = getTokenSustainEffects(token);
	if(!sustainedEffects || sustainedEffects.length === 0)
		return;
	
	const useChat = game.settings.get(moduleId, useChatSetting);

	if( useChat ) {
		let templateData = {};
		templateData.actor = actor;
		templateData.effects = sustainedEffects;
		// Owners include players with specific setting and game masters
		const owners = Object.keys(actor.ownership).filter((key) => actor.ownership[key] == CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
		
		const content = await renderTemplate(`modules/${moduleId}/templates/sustain-reminder.hbs`, templateData);
		
		await ChatMessage.create({
			content: content,
			speaker: ChatMessage.getSpeaker({ token, actor, user: game.users.get(userId) }),
			whisper: owners,
			flags: { "pf2e-sustain-reminder": true }
		});
	}
});

function isSpell(message) {
	return message?.flags?.pf2e?.origin?.type === 'spell' ?? false;
}

function getSpellId(message) {
	const uuid = message?.flags?.pf2e?.origin?.uuid ?? undefined;
	if(!uuid) return undefined;
	return uuid.split('.').pop();
}

function getSpell(actor, spellId) {
	const spellcasting = actor.spellcasting;
	let spell;

	spellcasting.collections.forEach((entry) => {
		const foundSpell = entry.get(spellId);
		if(foundSpell) spell = foundSpell;
	});

	return spell;
}

function isSpellSustained(spell) {
	const duration = spell.system.duration;
	return duration.sustained;
}

function getDurationForSustained(durationTextSustained) {
	const spellDuration = durationTextSustained || '';
	console.info(spellDuration);
    let durationValue, durationUnit;
	
	try {
		if (spellDuration) {
			// "1 minute"
			durationValue = parseInt(spellDuration);
			durationUnit = spellDuration.split(' ')[1];
			if (!durationUnit.endsWith('s')) durationUnit += 's';  // e.g. "minutes"
		}
	} catch {
		// Do nothing
	} finally {
		if(!durationValue || !durationUnit) {
			durationValue = 1;
			durationUnit = 'unlimited';
		}
	}

	return {durationValue, durationUnit};
}

function createReminderEffect(spell) {
	const duration = spell.system.duration ? spell.system.duration.value : '';
	const {durationValue, durationUnit} = getDurationForSustained(duration);
	
	const effectName = `${susainedEffectPrefix}${spell.name}`;
	const description = spell.system.description.value;
	
	const effectLevel = spell.system.level ? spell.system.level.value : 
		(spell.parent.system.details.level ? spell.parent.system.details.level.value : 1);
	const image = spell.img;
	
	return {
		type: 'effect',
		name: effectName,
		img: image,
		data: {
			tokenIcon: { show: true },
			duration: {
				value: durationValue,
				unit: durationUnit,
				sustained: true,
				expiry: 'turn-start'
			},
			description: {
				...spell.system.description,
				value: description
			},
			unindentified: false,
			traits: spell.system.traits,
			level: effectLevel,
			source: spell.system.source,
			slug: `sustaining-effect-${spell.system.slug}`
		},
		flags: {}
	};
}

function doesTokenContainEffectOfTheSameName(token, effect) {
	return token.actor.items.find((item) => item.name === effect.name) !== undefined;
}

function getTokenSustainEffects(token) {
	return token.actor.items.filter((item) => item.type === 'effect' && item.name.startsWith(susainedEffectPrefix));
}