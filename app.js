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
// GPU PARTICLES
//////////////////////////////////////////////////////////

const MAX_PARTICLES = 50000;

const particlePositions = new Float32Array(
    MAX_PARTICLES * 3
);

const particleColors = new Float32Array(
    MAX_PARTICLES * 3
);

let particleCount = 0;

const particlesGeometry =
    new THREE.BufferGeometry();

particlesGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
        particlePositions,
        3
    )
);

particlesGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(
        particleColors,
        3
    )
);

particlesGeometry.setDrawRange(
    0,
    0
);

const particlesMaterial =
    new THREE.PointsMaterial({
        size: 1.2,
        vertexColors: true,
        transparent: true,
        opacity: 1
    });

const particleSystem =
    new THREE.Points(
        particlesGeometry,
        particlesMaterial
    );

scene.add(particleSystem);

function spawnParticle(
    x,
    y,
    z,
    color
) {

    if (
        particleCount >=
        MAX_PARTICLES
    )
        return;

    const i =
        particleCount * 3;

    particlePositions[i] = x;
    particlePositions[i + 1] = y;
    particlePositions[i + 2] = z;

    particleColors[i] = color.r;
    particleColors[i + 1] = color.g;
    particleColors[i + 2] = color.b;

    particleCount++;

    particlesGeometry.setDrawRange(
        0,
        particleCount
    );

    particlesGeometry.attributes.position.needsUpdate =
        true;

    particlesGeometry.attributes.color.needsUpdate =
        true;
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

    for (
        let i = 0;
        i < particleCount;
        i++
    ) {

        const idx = i * 3;

        const px =
            particlePositions[idx];

        const py =
            particlePositions[idx + 1];

        const pz =
            particlePositions[idx + 2];

        const dx = px - cx;
        const dy = py - cy;
        const dz = pz - cz;

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

            particlePositions[idx] +=
                dx *
                power *
                0.2;

            particlePositions[idx + 1] +=
                dy *
                power *
                0.2;

            particlePositions[idx + 2] +=
                dz *
                power *
                0.2;
        }
    }

    particlesGeometry.attributes.position.needsUpdate =
        true;
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
            color
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
            particlecount;

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
