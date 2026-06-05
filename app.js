import * as THREE from "three";

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import {
    HandLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

//////////////////////////////////////////////////////////
// SCENE
//////////////////////////////////////////////////////////

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.z = 120;

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

document.body.appendChild(renderer.domElement);

//////////////////////////////////////////////////////////
// BLOOM
//////////////////////////////////////////////////////////

const composer = new EffectComposer(renderer);

composer.addPass(
    new RenderPass(scene, camera)
);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(
        window.innerWidth,
        window.innerHeight
    ),
    1.5,
    0.7,
    0.1
);

composer.addPass(bloomPass);

//////////////////////////////////////////////////////////
// WEBCAM
//////////////////////////////////////////////////////////

const video = document.getElementById("webcam");

const stream = await navigator.mediaDevices.getUserMedia({
    video: true
});

video.srcObject = stream;

await video.play();

//////////////////////////////////////////////////////////
// MEDIAPIPE
//////////////////////////////////////////////////////////

const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
);

const handLandmarker =
    await HandLandmarker.createFromOptions(
        vision,
        {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
            },
            runningMode: "VIDEO",
            numHands: 2
        }
    );

//////////////////////////////////////////////////////////
// PARTICLES
//////////////////////////////////////////////////////////

const particles = [];
const maxParticles = 5000;

const particleGeometry =
    new THREE.SphereGeometry(0.5, 8, 8);

function spawnParticle(
    x,
    y,
    z,
    color,
    size = 1
) {

    if (particles.length >= maxParticles)
        return;

    const material =
        new THREE.MeshBasicMaterial({
            color: color
        });

    const particle =
        new THREE.Mesh(
            particleGeometry,
            material
        );

    particle.position.set(
        x,
        y,
        z
    );

    particle.scale.setScalar(size);

    scene.add(particle);

    particles.push(particle);
}

//////////////////////////////////////////////////////////
// DRAWING LINES
//////////////////////////////////////////////////////////

const drawPoints = [];

const lineMaterial =
    new THREE.LineBasicMaterial({
        color: 0xffffff
    });

function addLineSegment(
    x1,
    y1,
    z1,
    x2,
    y2,
    z2
) {

    const geometry =
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x1, y1, z1),
            new THREE.Vector3(x2, y2, z2)
        ]);

    const line =
        new THREE.Line(
            geometry,
            lineMaterial
        );

    scene.add(line);
}

//////////////////////////////////////////////////////////
// CAMERA CONTROL
//////////////////////////////////////////////////////////

let targetCamX = 0;
let targetCamY = 0;

let currentCamX = 0;
let currentCamY = 0;

//////////////////////////////////////////////////////////
// FORCE FIELD
//////////////////////////////////////////////////////////

function pushParticles(
    cx,
    cy,
    cz
) {

    for (const p of particles) {

        const dx =
            p.position.x - cx;

        const dy =
            p.position.y - cy;

        const dz =
            p.position.z - cz;

        const dist = Math.sqrt(
            dx * dx +
            dy * dy +
            dz * dz
        );

        if (
            dist > 0 &&
            dist < 25
        ) {

            const power =
                (25 - dist) / 25;

            p.position.x +=
                dx * power * 0.2;

            p.position.y +=
                dy * power * 0.2;

            p.position.z +=
                dz * power * 0.2;
        }
    }
}

//////////////////////////////////////////////////////////
// HAND UPDATE
//////////////////////////////////////////////////////////

function updateHands() {

    const result =
        handLandmarker.detectForVideo(
            video,
            performance.now()
        );

    if (!result.landmarks)
        return;

    for (const hand of result.landmarks) {

        //////////////////////////////////////////////////
        // INDEX FINGER
        //////////////////////////////////////////////////

        const index = hand[8];

        const ix =
            (index.x - 0.5) * 120;

        const iy =
            -(index.y - 0.5) * 120;

        const iz =
            index.z * 120;

        //////////////////////////////////////////////////
        // MIDDLE FINGER
        //////////////////////////////////////////////////

        const middle = hand[12];

        const mx =
            (middle.x - 0.5) * 120;

        const my =
            -(middle.y - 0.5) * 120;

        const mz =
            middle.z * 120;

        //////////////////////////////////////////////////
        // CAMERA CONTROL
        //////////////////////////////////////////////////

        targetCamY =
            ix * 0.01;

        targetCamX =
            iy * 0.008;

        //////////////////////////////////////////////////
        // PARTICLE DRAWING
        //////////////////////////////////////////////////

        const color =
            new THREE.Color().setHSL(
                (Date.now() * 0.0002) % 1,
                1,
                0.5
            );

        spawnParticle(
            ix,
            iy,
            iz,
            color,
            1.5
        );

        //////////////////////////////////////////////////
        // DRAW LINES
        //////////////////////////////////////////////////

        drawPoints.push({
            x: ix,
            y: iy,
            z: iz
        });

        if (drawPoints.length > 1) {

            const a =
                drawPoints[
                    drawPoints.length - 2
                ];

            const b =
                drawPoints[
                    drawPoints.length - 1
                ];

            addLineSegment(
                a.x,
                a.y,
                a.z,
                b.x,
                b.y,
                b.z
            );
        }

        //////////////////////////////////////////////////
        // FORCE FIELD
        //////////////////////////////////////////////////

        pushParticles(
            mx,
            my,
            mz
        );
    }
}

//////////////////////////////////////////////////////////
// UI
//////////////////////////////////////////////////////////

const fpsEl =
    document.getElementById("fps");

const handsEl =
    document.getElementById(
        "hands-count"
    );

const particlesEl =
    document.getElementById(
        "particle-count"
    );

let frames = 0;
let lastTime = performance.now();

function updateUI() {

    frames++;

    const now =
        performance.now();

    if (
        now - lastTime >
        1000
    ) {

        fpsEl.textContent =
            frames;

        handsEl.textContent =
            "2";

        particlesEl.textContent =
            particles.length;

        frames = 0;

        lastTime = now;
    }
}

//////////////////////////////////////////////////////////
// ANIMATION
//////////////////////////////////////////////////////////

function animate() {

    requestAnimationFrame(
        animate
    );

    updateHands();

    //////////////////////////////////////////////////////
    // SMOOTH CAMERA
    //////////////////////////////////////////////////////

    currentCamX +=
        (targetCamX -
            currentCamX) *
        0.05;

    currentCamY +=
        (targetCamY -
            currentCamY) *
        0.05;

    camera.position.x =
        Math.sin(
            currentCamY
        ) * 120;

    camera.position.y =
        currentCamX * 50;

    camera.position.z =
        Math.cos(
            currentCamY
        ) * 120;

    camera.lookAt(
        0,
        0,
        0
    );

    updateUI();

    composer.render();
}

animate();

//////////////////////////////////////////////////////////
// RESIZE
//////////////////////////////////////////////////////////

window.addEventListener(
    "resize",
    () => {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

        composer.setSize(
            window.innerWidth,
            window.innerHeight
        );
    }
);
