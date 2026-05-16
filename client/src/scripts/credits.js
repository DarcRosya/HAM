export function initCredits() {
    console.log("Credits initialized! Loading elements...");
    
    const container = document.querySelector('.credits-container');
    
    if (container) {
        container.style.opacity = '1';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initCredits();
});