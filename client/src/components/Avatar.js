export function renderAvatar(props = {}) {
    const { name = 'Player 1', status = 'Ready' } = props;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'avatar';

    const circle = document.createElement('div');
    circle.className = 'circle';
    circle.setAttribute('aria-hidden', 'true');

    const textInfo = document.createElement('div');

    const nameDiv = document.createElement('div');
    nameDiv.className = 'name';
    nameDiv.innerText = name;

    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    statusDiv.innerText = status;

    textInfo.appendChild(nameDiv);
    textInfo.appendChild(statusDiv);
    
    avatarDiv.appendChild(circle);
    avatarDiv.appendChild(textInfo);

    return avatarDiv;
}
