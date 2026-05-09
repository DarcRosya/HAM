export function renderTable(props = {}) {
    const { title = "Table", subtitle = "Waiting for players..." } = props;

    const tableSection = document.createElement('section');
    tableSection.className = 'table';

    const h2 = document.createElement('h2');
    h2.className = 'table-title';
    h2.innerText = title;

    const p = document.createElement('p');
    p.className = 'table-subtitle';
    p.innerText = subtitle;

    tableSection.appendChild(h2);
    tableSection.appendChild(p);

    return tableSection;
}
