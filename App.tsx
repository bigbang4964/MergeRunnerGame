/*
Merge Runner - Prototype (Expo + TypeScript)
Version: React Native Reanimated 3 + Skia 1.5+ Compatible

Features:
- 2D gameplay logic (running → choice → boss → win/lose)
- Sprite animation (Image frames)
- Sound (expo-av)
- Particle effects (Skia)
- Firebase save/load
- Upgradable / skin-ready architecture

Setup:
1. expo init MergeRunnerPrototype -t expo-template-blank-typescript
2. expo install expo-av react-native-reanimated
   npm install @shopify/react-native-skia firebase
3. Add "react-native-reanimated/plugin" to babel.config.js
*/
import 'react-native-reanimated';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated, StatusBar, Image } from 'react-native';
import { useAudioPlayer, AudioSource } from 'expo-audio';
import { Asset } from 'expo-asset';
import {
  Canvas,
  Circle,
  Group,
} from '@shopify/react-native-skia';
import { useSharedValue, withTiming, useDerivedValue } from 'react-native-reanimated';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCL3KeV777c6yFNnkfaLrX8RJNZF-unBfY",
  authDomain: "mergerunnergame.firebaseapp.com",
  databaseURL: "https://mergerunnergame-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "mergerunnergame",
  storageBucket: "mergerunnergame.firebasestorage.app",
  messagingSenderId: "537055201943",
  appId: "1:537055201943:web:0f7ea2aab711dd3de4f7d2",
  measurementId: "G-4D7EKVV1ZY"
};

// Firebase init
let firebaseApp: any = null;
let db: any = null;
try {
  firebaseApp = initializeApp(firebaseConfig);
  db = getDatabase(firebaseApp);
} catch (e) {
  // ignore if already initialized
}

const { width, height } = Dimensions.get('window');
const GAME_HEIGHT = Math.min(720, height);
type GameState = 'running' | 'choice' | 'boss' | 'win' | 'lose';

const PLAYER_SPRITE_FRAMES = [
  require('./assets/player_0.png'),
  require('./assets/player_1.png'),
  require('./assets/player_2.png'),
  require('./assets/player_3.png'),
];

export default function App() {
  const [power, setPower] = useState(10);
  const scale = useRef(new Animated.Value(1)).current;
  const [rounds, setRounds] = useState(0);
  const [state, setState] = useState<GameState>('running');
  const [leftValue, setLeftValue] = useState(0);
  const [rightValue, setRightValue] = useState(0);
  const [bossPower, setBossPower] = useState(40);
  const [frameIndex, setFrameIndex] = useState(0);

  // Sprite frame loop
  useEffect(() => {
    const t = setInterval(() => {
      setFrameIndex((i) => (i + 1) % PLAYER_SPRITE_FRAMES.length);
    }, 120);
    return () => clearInterval(t);
  }, []);

  // Sounds
// ✅ Chuẩn bị nguồn âm thanh (Asset → URI)
const pickAsset = Asset.fromModule(require('./assets/sounds/pick.wav'));
const winAsset = Asset.fromModule(require('./assets/sounds/win.wav'));
const loseAsset = Asset.fromModule(require('./assets/sounds/lose.wav'));

const pickPlayer = useAudioPlayer(pickAsset.localUri ? { uri: pickAsset.localUri } : { uri: pickAsset.uri });
const winPlayer = useAudioPlayer(winAsset.localUri ? { uri: winAsset.localUri } : { uri: winAsset.uri });
const losePlayer = useAudioPlayer(loseAsset.localUri ? { uri: loseAsset.localUri } : { uri: loseAsset.uri });

const playSound = async (type: 'pick' | 'win' | 'lose') => {
  try {
    if (type === 'pick') await pickPlayer.play();
    else if (type === 'win') await winPlayer.play();
    else if (type === 'lose') await losePlayer.play();
  } catch (e) {
    console.warn('Sound play error:', e);
  }
};


  // 🎆 Particles via Reanimated + Skia
  const particleProgress = useSharedValue(0);
  const triggerParticles = () => {
    particleProgress.value = 0;
    particleProgress.value = withTiming(1, { duration: 700 });
  };

  const particles = Array.from({ length: 8 }).map((_, i) => {
    const angle = (Math.PI * 2 * i) / 8;
    const dist = 20 + i * 6;
    const cx = width / 2 + Math.cos(angle) * dist;
    const cy = GAME_HEIGHT / 2 - 20 + Math.sin(angle) * dist;
    const radius = useDerivedValue(() => particleProgress.value * (10 + i * 2));
    return { cx, cy, radius };
  });

  // 🕹 Game logic
  const spawnChoice = () => {
    const a = Math.floor(Math.random() * 18) - 4;
    const b = Math.floor(Math.random() * 18) - 4;
    setLeftValue(a);
    setRightValue(b);
    setState('choice');
  };

  useEffect(() => {
  let choiceTimer: NodeJS.Timeout | undefined;
  if (state === 'running') {
    choiceTimer = setTimeout(() => {
      spawnChoice();
    }, 1200 + Math.random() * 2000);
  }
  return () => {
    if (choiceTimer) clearTimeout(choiceTimer);
  };
}, [state, rounds]);

  const applyChoice = (val: number) => {
    const newPower = Math.max(0, power + val);
    setPower(newPower);
    setRounds((r) => r + 1);
    const targetScale = 1 + (newPower - 10) * 0.035;
    Animated.spring(scale, { toValue: targetScale, useNativeDriver: false }).start();
    playSound('pick');
    triggerParticles();

    setState('running');
    if (rounds + 1 >= 5) {
      setTimeout(() => setState('boss'), 600);
    }
  };

  const checkBoss = () => {
    if (power >= bossPower) {
      setState('win');
      playSound('win');
    } else {
      setState('lose');
      playSound('lose');
    }
    saveProgress({ power, rounds });
  };

  const resetGame = () => {
    setPower(10);
    scale.setValue(1);
    setRounds(0);
    setBossPower(30 + Math.floor(Math.random() * 30));
    setState('running');
  };

  // 💾 Firebase Save/Load
  async function saveProgress(obj: any) {
    if (!db) return;
    try {
      await set(ref(db, 'players/demo'), { ...obj, timestamp: Date.now() });
    } catch {}
  }

  async function loadProgress() {
    if (!db) return;
    try {
      const snapshot = await get(ref(db, 'players/demo'));
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data.power) setPower(data.power);
        if (data.rounds) setRounds(data.rounds);
      }
    } catch {}
  }

  useEffect(() => {
    loadProgress();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.header}>
        <Text style={styles.headerText}>Merge Runner — Enhanced Prototype</Text>
        <Text style={styles.subText}>Power: {power} • Rounds: {rounds} • Boss: {bossPower}</Text>
      </View>

      <View style={styles.gameArea}>
        <View style={styles.bgLayer} />

        {/* Particles */}
        <Canvas style={styles.canvas}>
          <Group>
            {particles.map((p, i) => (
              <Circle
                key={i}
                cx={p.cx}
                cy={p.cy}
                r={p.radius}
                color="#fff"
                opacity={0.85 - i * 0.1}
              />
            ))}
          </Group>
        </Canvas>

        {/* Player sprite */}
        <Animated.View style={[styles.ground, { transform: [{ scale }] }]}>
          <Image source={PLAYER_SPRITE_FRAMES[frameIndex]} style={styles.playerSprite} />
        </Animated.View>

        {/* Choice HUD */}
        {state === 'choice' && (
          <View style={styles.choiceHud}>
            <TouchableOpacity style={styles.choiceButton} onPress={() => applyChoice(leftValue)}>
              <Text style={styles.choiceValue}>{leftValue >= 0 ? `+${leftValue}` : leftValue}</Text>
              <Text style={styles.choiceLabel}>Left</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.choiceButton} onPress={() => applyChoice(rightValue)}>
              <Text style={styles.choiceValue}>{rightValue >= 0 ? `+${rightValue}` : rightValue}</Text>
              <Text style={styles.choiceLabel}>Right</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Boss Fight */}
        {state === 'boss' && (
          <View style={styles.overlayBox}>
            <Text style={styles.overlayTitle}>Boss Encounter!</Text>
            <Text style={styles.bossText}>Boss Power: {bossPower}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={checkBoss}>
              <Text style={styles.primaryButtonText}>Fight!</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Win / Lose */}
        {(state === 'win' || state === 'lose') && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>{state === 'win' ? 'You Won!' : 'You Lost!'}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={resetGame}>
              <Text style={styles.primaryButtonText}>Restart</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Skia + Reanimated v3 + Expo + Firebase ready.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#071027', alignItems: 'center' },
  header: { width: '100%', paddingTop: 36, paddingHorizontal: 16 },
  headerText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subText: { color: '#9aa6c0', fontSize: 12, marginTop: 4 },
  gameArea: { width: '100%', height: GAME_HEIGHT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bgLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#071b2f', opacity: 0.5 },
  canvas: { ...StyleSheet.absoluteFillObject },
  ground: { position: 'absolute', bottom: 80, width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  playerSprite: { width: 120, height: 120, resizeMode: 'contain' },
  choiceHud: { position: 'absolute', bottom: 200, flexDirection: 'row', gap: 20 },
  choiceButton: { padding: 14, backgroundColor: '#0f2a44', borderRadius: 12, alignItems: 'center' },
  choiceValue: { fontSize: 28, color: '#fff', fontWeight: '700' },
  choiceLabel: { fontSize: 12, color: '#9aa6c0', marginTop: 4 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  overlayBox: { position: 'absolute', top: '40%', alignItems: 'center' },
  overlayTitle: { fontSize: 28, color: '#fff', fontWeight: '800', marginBottom: 12 },
  bossText: { color: '#fff', marginBottom: 12 },
  primaryButton: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#6a9cff', borderRadius: 8 },
  primaryButtonText: { color: '#06203d', fontWeight: '800' },
  footer: { width: '100%', padding: 12, alignItems: 'center' },
  footerText: { color: '#8fa0c3', fontSize: 12 },
});
