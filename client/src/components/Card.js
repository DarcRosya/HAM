export function renderCard(props = {}) {
  const {
    name = 'Unknown',
    cost = 0,
    attack = 0,
    defense = 0,
    type = 'Unit',
    description = '',
    art = '/assets/cards-art/bubblegum.png',
    faceDown = false,
    variant = 'hand', // 'hand' или 'board'
    traits = [],
  } = props;

  const isSpell = String(type).toLowerCase() === 'spell';
  const frameSrc = resolveCardFrame(traits, variant, type);

  const cardDiv = document.createElement('div');
  cardDiv.classList.add('card');

  const normalizedTraits = Array.isArray(traits)
    ? traits.map((t) => String(t).toLowerCase())
    : typeof traits === 'string'
      ? [traits.toLowerCase()]
      : [];

  if (normalizedTraits.includes('poison')) {
    cardDiv.dataset.isPoison = 'true';
  }

  if (faceDown) {
    cardDiv.classList.add('face-down');
    cardDiv.innerHTML = `<img src="/assets/images/card-back.png" class="card-back" style="width: 100%; height: 100%;">`;
    return cardDiv;
  }

  // === НОВАЯ ЛОГИКА ДЛЯ СТОЛА (ОВAЛЬНЫЙ ТОКЕН) ===
  if (variant === 'board') {
    cardDiv.classList.add('card-board'); // Оставляем класс для JS-селекторов
    if (props.isNew) {
      cardDiv.classList.add('anim-card-drop', 'anim-card-spawn');
    }

    const tokenStats = isSpell
      ? ''
      : `
      <div class="token-stat token-attack">${attack}</div>
      <div class="token-stat token-defense">${defense}</div>
    `;

    cardDiv.innerHTML = `
      <div class="token-art" style="background-image: url('${art}');"></div>
      <img src="${frameSrc}" class="token-border">
      ${tokenStats}
    `;
    return cardDiv;
  }

  // === ЛОГИКА ДЛЯ РУКИ (ПОЛНОЦЕННАЯ КАРТА) ===
  const statBadges = isSpell
    ? ''
    : `
    <div class="card-attack">${attack}</div>
    <div class="card-defense">${defense}</div>
  `;

  const descriptionHtml = highlightKeywords(description);
  const titleClass = name.length > 13 ? 'card-title long-title' : 'card-title';

  cardDiv.innerHTML = `
    <div class="card-art" style="background-image: url('${art}');"></div>
    <img src="${frameSrc}" class="card-frame">
    <div class="${titleClass}">${name}</div>
    <div class="card-cost">${cost}</div>
    <div class="card-type">${type}</div>
    <div class="card-description">${descriptionHtml}</div>
    ${statBadges}
  `;

  return cardDiv;
}

function resolveCardFrame(traits, variant, type) {
  const isSpell = String(type).toLowerCase() === 'spell';
  if (variant === 'hand')
    return isSpell ? '/assets/images/card-frame-spell.png' : '/assets/images/card-frame.png';

  let normalized = [];
  if (Array.isArray(traits)) {
    normalized = traits.map((trait) => String(trait).toLowerCase());
  } else if (typeof traits === 'string') {
    normalized = [traits.toLowerCase()];
  }
  if (normalized.includes('taunt')) return '/assets/images/taunt-frame.png';
  if (normalized.includes('berserk')) return '/assets/images/berserk-frame.png';
  if (normalized.includes('poison')) return '/assets/images/poison-frame.png';

  return '/assets/images/default-frame.png';
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightKeywords(description) {
  const safeText = escapeHtml(description || '');
  const keywords = ['taunt', 'charge', 'poison', 'berserk', 'damage', 'defense', 'attack', 'mana'];
  const regex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');

  return safeText.replace(regex, (match) => {
    const key = match.toLowerCase();
    return `<span class="card-keyword" data-keyword="${key}">${match}</span>`;
  });
}
