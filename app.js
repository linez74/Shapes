import * as THREE from "three";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import {
    HandLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

//////////////////////////////////////////////////////////
// BASIC SETUP
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
// POST PROCESSING (GLOW)
//////////////////////////////////////////////////////////

const composer = new EffectComposer(renderer);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.2,   // strength
    0.6,   // radius
    0.1    // threshold
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
// MEDIA PIPE HANDS
//////////////////////////////////////////////////////////

const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
);

const handLandmarker = await HandLandmarker.createFromOptions(
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
// DATA STORAGE
//////////////////////////////////////////////////////////

const indexTrail = [];
const middleTrail = [];

const TRAIL_LIFE = 4000;

//////////////////////////////////////////////////////////
// PARTICLE SYSTEM (REUSABLE)
//////////////////////////////////////////////////////////

const particles = [];
const maxParticles = 3000;

const particleGeometry = new THREE.SphereGeometry(0.6, 8, 8);
const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff
});

function spawnParticle(x, y, z, color, size = 1) {
    let p;

    if (particles.length < maxParticles) {
        p = new THREE.Mesh(particleGeometry, particleMaterial.clone());
        scene.add(p);
        particles.push(p);
    } else {
        p = particles.shift();
        particles.push(p);
    }

    p.position.set(x, y, z);
    p.material.color = color;
    p.scale.setScalar(size);

    p.userData.life = Date.now();

    return p;
}

//////////////////////////////////////////////////////////
// HAND UPDATE
//////////////////////////////////////////////////////////

async function updateHands() {
    const result = handLandmarker.detectForVideo(
        video,
        performance.now()
    );

    if (!result.landmarks) return;

    for (const hand of result.landmarks) {

        const index = hand[8];
        const middle = hand[12];

        const ix = (index.x - 0.5) * 120;
        const iy = -(index.y - 0.5) * 120;
        const iz = index.z * 120;

        const mx = (middle.x - 0.5) * 120;
        const my = -(middle.y - 0.5) * 120;
        const mz = middle.z * 120;

        const now = Date.now();

        indexTrail.push({ x: ix, y: iy, z: iz, t: now });
        middleTrail.push({ x: mx, y: my, z: mz, t: now });

        const color = new THREE.Color().setHSL((now * 0.0002) % 1, 1, 0.5);

        spawnParticle(ix, iy, iz, color, 1.5);
        spawnParticle(mx, my, mz, color, 1.0);
    }
}

//////////////////////////////////////////////////////////
// FORCE SYSTEM (your original idea upgraded)
//////////////////////////////////////////////////////////

function applyForce(a, b, strength = 0.02, radius = 25) {

    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;

    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 0 && dist < radius) {

        const force = (1 - dist / radius) * strength;

        a.x += dx * force;
        a.y += dy * force;
        a.z += dz * force;
    }
}

//////////////////////////////////////////////////////////
// CLEANUP OLD DATA
//////////////////////////////////////////////////////////

function cleanup() {

    const now = Date.now();

    while (indexTrail.length && now - indexTrail[0].t > TRAIL_LIFE)
        indexTrail.shift();

    while (middleTrail.length && now - middleTrail[0].t > TRAIL_LIFE)
        middleTrail.shift();
}

//////////////////////////////////////////////////////////
// UI
//////////////////////////////////////////////////////////

const fpsEl = document.getElementById("fps");
const handsEl = document.getElementById("hands-count");
const particlesEl = document.getElementById("particle-count");

let lastTime = performance.now();
let frames = 0;

function updateUI() {

    frames++;

    const now = performance.now();

    if (now - lastTime > 1000) {

        fpsEl.textContent = frames;
        handsEl.textContent = 2;
        particlesEl.textContent = particles.length;

        frames = 0;
        lastTime = now;
    }
}

//////////////////////////////////////////////////////////
// ANIMATION LOOP
//////////////////////////////////////////////////////////

function animate() {

    requestAnimationFrame(animate);

    updateHands();
    cleanup();

    // slow universe rotation
    scene.rotation.y += 0.002;

    // subtle hand interaction force
    for (const t of indexTrail) {
        for (const m of middleTrail) {
            applyForce(t, m);
        }
    }

    updateUI();

    composer.render();
}

animate();

//////////////////////////////////////////////////////////
// RESIZE
//////////////////////////////////////////////////////////

window.addEventListener("resize", () => {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
