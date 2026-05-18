export function mount() {
    console.log('Credits mounted!');

    const container = document.querySelector('.credits-container');
    if (container) {
        container.style.opacity = '1';
    }

    const returnBtn = document.getElementById('returnBtn');
    if (returnBtn) {
        returnBtn.addEventListener('click', () => {
            window.history.back();
        });
    }

    const cube = document.getElementById('cube');
    const faces = document.querySelectorAll('.cube-face');

    if (!cube || faces.length === 0) return;

    const appearTime = 2000;
    const waitTime = 2000;

    async function rotateCube(currentAngle, nextAngle) {
        cube.style.transform = `translateZ(-2000px) rotateY(${currentAngle}deg)`;
        await new Promise(r => setTimeout(r, 600));

        cube.style.transform = `translateZ(-2000px) rotateY(${nextAngle}deg)`;
        await new Promise(r => setTimeout(r, 600));

        cube.style.transform = `translateZ(-640px) rotateY(${nextAngle}deg)`;
        await new Promise(r => setTimeout(r, 600));
    }

    async function crazyTornado(currentAngle, nextAngle) {
        cube.style.transform = `translateZ(-3000px) rotateY(${currentAngle}deg) rotateZ(1080deg) scale(0)`;
        await new Promise(r => setTimeout(r, 800));

        cube.style.transform = `translateZ(-3000px) rotateY(${nextAngle}deg) rotateZ(-1080deg) scale(0)`;
        await new Promise(r => setTimeout(r, 50));

        cube.style.transform = `translateZ(-640px) rotateY(${nextAngle}deg) rotateZ(0deg) scale(1)`;
        await new Promise(r => setTimeout(r, 800));
    }

    async function catapultDrop(currentAngle, nextAngle) {
        cube.style.transition = 'transform 0.5s cubic-bezier(0.5, 0, 1, 0.5)';
        cube.style.transform = `translateY(-3000px) translateZ(-1500px) rotateY(${currentAngle}deg) rotateX(45deg)`;
        await new Promise(r => setTimeout(r, 600));

        cube.style.transition = 'none';
        cube.style.transform = `translateY(3000px) translateZ(-1500px) rotateY(${nextAngle}deg) rotateX(-45deg)`;
        await new Promise(r => setTimeout(r, 50));

        cube.style.transition = 'transform 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        cube.style.transform = `translateY(0px) translateZ(-640px) rotateY(${nextAngle}deg) rotateX(0deg)`;
        await new Promise(r => setTimeout(r, 800));

        cube.style.transition = 'transform 0.6s cubic-bezier(0.45, 0, 0.55, 1)';
    }

    async function animatePage(pageIndex) {
        if (pageIndex >= faces.length) return;

        const currentFace = faces[pageIndex];
        const items = currentFace.querySelectorAll('.credit-item');

        const animationDuration = 0.7;
        const totalAppearSeconds = appearTime / 1000;
        const delayStep = items.length > 1 ? (totalAppearSeconds - animationDuration) / (items.length - 1) : 0;

        items.forEach((item, index) => {
            item.style.animation = `slideUpFade ${animationDuration}s ease-out ${delayStep * index}s forwards`;
        });

        setTimeout(async () => {
            if (pageIndex < faces.length - 1) {
                const currentAngle = pageIndex * -90;
                const nextAngle = (pageIndex + 1) * -90;

                if (pageIndex === 0) {
                    await rotateCube(currentAngle, nextAngle);
                } else if (pageIndex === 1) {
                    await crazyTornado(currentAngle, nextAngle);
                } else if (pageIndex === 2) {
                    await catapultDrop(currentAngle, nextAngle);
                }

                animatePage(pageIndex + 1);
            } else {
                triggerBulldozerEnding();
            }
        }, appearTime + waitTime);
    }

    function triggerBulldozerEnding() {
        const bulldozer = document.getElementById('bulldozer');
        const viewport = document.getElementById('viewport');

        if (bulldozer) {
            bulldozer.style.display = 'block';

            setTimeout(() => {
                bulldozer.style.left = '-50px';
            }, 50);
        }

        setTimeout(() => {

            if (bulldozer) {
                bulldozer.style.transition = 'left 1.2s cubic-bezier(0.5, 0, 1, 0.5)';
                bulldozer.style.left = '150vw';
            }

            if (viewport) {
                viewport.classList.add('viewport-pushed');
            }

            setTimeout(() => {
                window.history.back();
            }, 1200);

        }, 850);
    }

    animatePage(0);
}

export function unmount() {
    const container = document.querySelector('.credits-container');
    if (container) {
        container.style.opacity = '0';
    }
}