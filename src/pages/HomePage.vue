
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { PlusIcon, FireIcon, ShoppingBagIcon, BuildingStorefrontIcon, BackspaceIcon, MicrophoneIcon, TruckIcon, EllipsisHorizontalIcon, TrashIcon, PencilIcon } from '@heroicons/vue/24/outline';
import { initDB, addBillToDB, getAllBillsFromDB, deleteBillFromDB, updateBillInDB, type BillInDB } from '@/utils/db';

type Payer = 'me' | 'them';

const isPanelOpen = ref(false);
const isVoicePanelOpen = ref(false);
const newAmountStr = ref('0');
const payer = ref<Payer>('me');
const isRecording = ref(false);
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
const totalExpenditure = computed(() => personA.value.amount + personB.value.amount);
const displayTotalExpenditure = ref(0);

const personA = computed(() => ({ 
  name: '我', 
  amount: recentBills.value.filter(b => b.payer === 'me').reduce((sum, b) => sum + b.amount, 0) 
}));
const personB = computed(() => ({ 
  name: '对方', 
  amount: recentBills.value.filter(b => b.payer === 'them').reduce((sum, b) => sum + b.amount, 0) 
}));

const recentBills = ref<any[]>([]);

const showInstallPrompt = ref(false);

onMounted(async () => {
  if (localStorage.getItem('installPromptDismissed') !== 'true') {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone) {
      // Use a timeout to avoid overwhelming the user immediately
      setTimeout(() => {
        showInstallPrompt.value = true;
      }, 2500);
    }
  }

  await initDB();
  const billsFromDB = await getAllBillsFromDB();
  if (billsFromDB.length > 0) {
    recentBills.value = billsFromDB;
  } else {
    // If DB is empty, populate with some initial data and save it
    const initialBills = [
      { id: Date.now() + 1, description: '晚餐', amount: 120.00, icon: FireIcon, payer: 'me' as Payer, iconName: 'FireIcon' },
      { id: Date.now() + 2, description: '超市购物', amount: 230.50, icon: ShoppingBagIcon, payer: 'them' as Payer, iconName: 'ShoppingBagIcon' },
    ].reverse(); // Keep order consistent with unshift
    recentBills.value = initialBills.map(b => ({...b, icon: categories.find(c => c.iconName === b.iconName)?.icon }));
    
    for (const bill of initialBills) {
      await addBillToDB({
        id: bill.id,
        description: bill.description,
        amount: bill.amount,
        payer: bill.payer,
        iconName: bill.iconName,
      });
    }
  }
  displayTotalExpenditure.value = totalExpenditure.value;
});

onUnmounted(() => {
  // Cleanup logic
});

const categories = [
  { name: '餐饮', icon: FireIcon, iconName: 'FireIcon' },
  { name: '购物', icon: ShoppingBagIcon, iconName: 'ShoppingBagIcon' },
  { name: '交通', icon: TruckIcon, iconName: 'TruckIcon' },
  { name: '娱乐', icon: BuildingStorefrontIcon, iconName: 'BuildingStorefrontIcon' },
];
const selectedCategory = ref(categories[0]);

function dismissInstallPrompt() {
  showInstallPrompt.value = false;
  localStorage.setItem('installPromptDismissed', 'true');
}

let pressTimer: ReturnType<typeof setTimeout> | null = null;

function handlePressStart() {
  pressTimer = setTimeout(() => {
    isVoicePanelOpen.value = true;
    pressTimer = null;
  }, 400);
}

function handlePressEnd() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    isPanelOpen.value = true;
  }
}

const personAPercentage = computed(() => totalExpenditure.value === 0 ? 0 : (personA.value.amount / totalExpenditure.value) * 100);
const personBPercentage = computed(() => totalExpenditure.value === 0 ? 0 : (personB.value.amount / totalExpenditure.value) * 100);
const formattedAmount = computed(() => parseFloat(newAmountStr.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

async function toggleRecording() {
  if (isRecording.value) {
    mediaRecorder?.stop();
    isRecording.value = false;
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    isRecording.value = true;
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      console.log('录音完成', audioBlob);
      alert('录音已完成！请提供 API 接入。');
      isVoicePanelOpen.value = false;
    };
    mediaRecorder.start();
  } catch (err) {
    console.error('麦克风权限获取失败:', err);
    alert('无法获取麦克风权限。');
    isRecording.value = false;
  }
}

function handleKeyPress(key: string) {
  if (key === 'del') {
    newAmountStr.value = newAmountStr.value.length > 1 ? newAmountStr.value.slice(0, -1) : '0';
  } else if (key === '.' && !newAmountStr.value.includes('.')) {
    newAmountStr.value += '.';
  } else if (key !== '.') {
    if (newAmountStr.value === '0') {
      newAmountStr.value = key;
    } else if (newAmountStr.value.length < 10) {
      newAmountStr.value += key;
    }
  }
}

async function handleTransactionSubmit() {
  const amount = parseFloat(newAmountStr.value);
  if (!amount || isNaN(amount)) {
    isPanelOpen.value = false;
    newAmountStr.value = '0';
    editingBill.value = null;
    return;
  }

  const billData: BillInDB = {
    id: editingBill.value ? editingBill.value.id : Date.now(),
    description: selectedCategory.value.name,
    amount,
    payer: payer.value,
    iconName: selectedCategory.value.iconName,
  };

  if (editingBill.value) {
    // Update existing bill
    await updateBillInDB(billData);
    const index = recentBills.value.findIndex(b => b.id === billData.id);
    if (index !== -1) {
      recentBills.value[index] = { ...billData, icon: selectedCategory.value.icon };
    }
  } else {
    // Add new bill
    await addBillToDB(billData);
    recentBills.value.unshift({ ...billData, icon: selectedCategory.value.icon });
  }
  
  isPanelOpen.value = false;
  newAmountStr.value = '0';
  payer.value = 'me';
  selectedCategory.value = categories[0];
  editingBill.value = null;
}

let animationInterval: ReturnType<typeof setInterval> | null = null;
watch(totalExpenditure, (newValue, oldValue) => {
  if (animationInterval) clearInterval(animationInterval);
  const startValue = oldValue;
  const duration = 1000, frameRate = 60;
  const totalFrames = duration / (1000 / frameRate);
  const increment = (newValue - startValue) / totalFrames;
  let currentFrame = 0;
  animationInterval = setInterval(() => {
    currentFrame++;
    displayTotalExpenditure.value += increment;
    if (currentFrame >= totalFrames) {
      clearInterval(animationInterval as NodeJS.Timeout);
      animationInterval = null;
      displayTotalExpenditure.value = newValue;
    }
  }, 1000 / frameRate);
});

const openedMenuBillId = ref<number | null>(null);

const editingBill = ref<any | null>(null);

async function deleteBill(id: number) {
  await deleteBillFromDB(id);
  recentBills.value = recentBills.value.filter(b => b.id !== id);
  openedMenuBillId.value = null; // Close menu after deletion
}

function startEditing(bill: any) {
  editingBill.value = bill;
  newAmountStr.value = bill.amount.toString();
  payer.value = bill.payer;
  selectedCategory.value = categories.find(c => c.name === bill.description) || categories[0];
  openedMenuBillId.value = null;
  isPanelOpen.value = true;
}

const keypad = ['1','2','3','4','5','6','7','8','9','.','0','del'];

const fabContainer = ref<HTMLElement | null>(null);

onMounted(() => {
  // Logic for magnetic FAB can be re-added here if desired
});

onUnmounted(() => {
  // Cleanup logic
});

</script>

<template>
  <div class="main-container pt-12 pb-28 pt-[env(safe-area-inset-top)] pb-[calc(7rem+env(safe-area-inset-bottom))]">
    <div class="background-blobs">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
    </div>

    <div class="flex flex-col space-y-6 max-w-md mx-auto h-full px-4" :class="{ 'panel-open': isPanelOpen || isVoicePanelOpen }">
      
      <!-- Total Expenditure -->
      <div class="bento-card flex flex-col justify-center items-center flex-shrink-0">
        <p class="text-base text-indigo-300 mb-1">本月总支出</p>
        <h1 class="font-bold text-5xl text-white tracking-tight main-amount">
          <span class="font-light text-3xl align-middle">¥</span>{{ displayTotalExpenditure.toFixed(2) }}
        </h1>
      </div>

      <!-- Spending Ratio -->
      <div class="bento-card p-4 flex-shrink-0">
        <div class="w-full">
            <div class="flex justify-between items-center text-white text-xs font-bold mb-1">
                <span>{{ personA.name }} ({{ personAPercentage.toFixed(0) }}%)</span>
                <span>{{ personB.name }} ({{ personBPercentage.toFixed(0) }}%)</span>
            </div>
            <div class="w-full bg-black/20 rounded-full h-3 overflow-hidden flex shadow-inner">
                <div class="neon-bar h-full transition-all duration-700 ease-out" :style="{ width: personAPercentage + '%', '--glow-color': '#4c42fe' }"></div>
                <div class="neon-bar h-full transition-all duration-700 ease-out" :style="{ width: personBPercentage + '%', '--glow-color': '#ff693e' }"></div>
            </div>
        </div>
      </div>

      <!-- Recent Bills -->
      <div class="bento-card flex-grow min-h-0 flex flex-col">
        <h2 class="text-xl font-bold text-indigo-200 mb-4 flex-shrink-0">最近账单</h2>
        <div class="space-y-4 overflow-y-auto pr-2 flex-grow">
          <div v-for="bill in recentBills" :key="bill.id" class="bill-card">
             <div class="flex items-center space-x-4">
                <div class="glowing-bead" :style="{'--bead-color': bill.payer === 'me' ? '#60a5fa' : '#f472b6'}"></div>
                <span class="text-indigo-200">{{ bill.description }}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-bold text-lg tracking-tight text-white">¥{{ bill.amount.toFixed(2) }}</span>
              <button class="p-1 text-gray-500 hover:text-white rounded-full transition-colors focus:outline-none" @click.stop="openedMenuBillId = openedMenuBillId === bill.id ? null : bill.id">
                <EllipsisHorizontalIcon class="w-6 h-6" />
              </button>
              <transition name="slide-left-fade">
                <div v-if="openedMenuBillId === bill.id" class="flex items-center space-x-2">
                  <button @click="startEditing(bill)" class="p-2 bg-blue-500/60 hover:bg-blue-500/90 rounded-full text-white flex items-center justify-center transition-colors">
                    <PencilIcon class="w-5 h-5" />
                  </button>
                  <button @click="deleteBill(bill.id)" class="p-2 bg-red-500/60 hover:bg-red-500/90 rounded-full text-white flex items-center justify-center transition-colors">
                    <TrashIcon class="w-5 h-5" />
                  </button>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div ref="fabContainer" class="fixed right-6 bottom-10 z-50 fab-container">
        <div class="fab-shadow"></div>
        <div class="fab-cube"
            @mousedown.prevent="handlePressStart"
            @mouseup.prevent="handlePressEnd"
            @touchstart.prevent="handlePressStart"
            @touchend.prevent="handlePressEnd"
            @contextmenu.prevent>
            <div class="face front"><div class="inner-plus">+</div></div>
            <div class="face back"></div><div class="face top"></div><div class="face bottom"></div><div class="face left"></div><div class="face right"></div>
        </div>
    </div>
    
    <!-- Keypad Panel RESTORED & RE-STYLED -->
    <transition name="panel-float">
      <div v-if="isPanelOpen" class="fixed inset-0 z-40 flex items-end">
        <div class="absolute inset-0 bg-black/30" @click="isPanelOpen = false"></div>
        <div class="panel-content w-full" :class="{
          'panel-glow-me': payer === 'me',
          'panel-glow-them': payer === 'them'
        }">
            <div class="max-w-sm mx-auto w-full flex-grow flex flex-col">
              <div class="flex justify-center items-center space-x-4 mb-4 flex-shrink-0">
                  <button @click="payer = 'me'" class="payer-btn" :class="{ 'payer-active-me': payer === 'me' }">{{ personA.name }}</button>
                  <button @click="payer = 'them'" class="payer-btn" :class="{ 'payer-active-them': payer === 'them' }">{{ personB.name }}</button>
              </div>
              <div class="text-center py-2 flex-shrink-0">
                <h2 class="font-bold text-6xl tracking-tight text-white main-amount">¥{{ formattedAmount }}</h2>
              </div>
              <div class="flex justify-around items-center my-4 px-2">
                  <button v-for="category in categories" :key="category.name" @click="selectedCategory = category"
                          class="flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-200"
                          :class="selectedCategory.name === category.name ? 'bg-indigo-500/50 scale-105' : 'bg-black/20 hover:bg-black/30'">
                      <component :is="category.icon" class="w-7 h-7 text-indigo-200" />
                      <span class="text-xs mt-1 text-gray-300">{{ category.name }}</span>
                  </button>
              </div>
              <div class="grid grid-cols-3 gap-3 flex-grow">
                <button v-for="key in keypad" :key="key" @click="handleKeyPress(key)" class="keypad-key">
                  <span v-if="key !== 'del'" class="text-3xl font-medium">{{ key }}</span>
                  <BackspaceIcon v-else class="w-8 h-8 mx-auto" />
                </button>
              </div>
              <button @click.stop="handleTransactionSubmit" class="w-full bg-indigo-500/80 text-white font-bold py-4 mt-4 rounded-2xl text-lg transition-transform active:scale-95 flex-shrink-0">完成</button>
            </div>
        </div>
      </div>
    </transition>

    <!-- Voice Panel RESTORED & RE-STYLED -->
    <transition name="fade">
        <div v-if="isVoicePanelOpen" class="fixed inset-0 bg-black/60 backdrop-blur-3xl z-50 flex flex-col items-center justify-center text-center p-8">
            <p class="absolute top-16 text-gray-400 text-lg">点击麦克风开始/结束录音</p>
            <button @click.stop="toggleRecording" class="relative w-32 h-32 md:w-40 md:h-40 rounded-full transition-all duration-300 flex items-center justify-center group" :class="isRecording ? 'bg-red-500/80' : 'bg-white/10'">
                <MicrophoneIcon class="w-16 h-16 md:w-20 md:h-20 transition-transform duration-300 group-hover:scale-110" :class="isRecording ? 'text-white' : 'text-indigo-300'" />
                <span v-if="isRecording" class="absolute h-full w-full rounded-full bg-red-500/50 animate-ping-slow"></span>
            </button>
            <p class="mt-8 text-2xl text-indigo-200 font-medium">{{ isRecording ? '正在聆听...' : '准备就绪' }}</p>
             <button @click="isVoicePanelOpen = false" class="absolute bottom-16 bg-white/10 text-indigo-200 font-bold py-3 px-8 rounded-2xl text-lg">关闭</button>
        </div>
    </transition>

    <!-- PWA Install Prompt -->
    <transition name="prompt-fade">
      <div v-if="showInstallPrompt" class="install-prompt fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-[60]">
          <div class="p-4 rounded-2xl bg-gray-800/60 backdrop-blur-xl border border-white/10 shadow-2xl">
              <p class="text-white text-center text-sm mb-3">点击 <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline-block -mt-1" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg> 分享按钮，选择“添加到主屏幕”</p>
              <button @click="dismissInstallPrompt" class="w-full bg-indigo-500/80 text-white font-bold py-2 rounded-lg text-sm">知道了</button>
          </div>
      </div>
    </transition>

  </div>
</template>

<style>
@import url('https://api.fontshare.com/v2/css?f[]=satoshi@900&display=swap');
:root {
    --glow-color: #4c42fe;
    --bead-color: #60a5fa;
}

body, .main-container {
  font-family: 'Satoshi', sans-serif;
  background-color: #111018;
  color: white;
  overflow: hidden;
}
.main-container { min-height: 100vh; position: relative; z-index: 1; padding: 1.5rem; }

.background-blobs {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;
}
.blob {
    position: absolute;
    width: 800px; height: 800px;
    border-radius: 50%;
    filter: blur(250px);
}
.blob-1 { background: rgba(76, 66, 254, 0.7); top: -40%; left: -40%; animation: drift 70s infinite alternate; }
.blob-2 { background: rgba(160, 168, 255, 0.7); bottom: -40%; right: -40%; animation: drift 75s infinite alternate-reverse; }

@keyframes drift {
    0% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(400px, 250px) scale(1.6); }
    100% { transform: translate(-250px, -350px) scale(0.8); }
}

body, html { 
  overscroll-behavior: none; 
}
.main-container {
  min-height: 100vh;
  height: 100vh;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
}

.bento-grid-container.panel-open {
  transform: scale(0.92) translateY(-10px);
  filter: blur(20px);
}

.bento-card {
    background-color: rgba(25, 25, 45, 0.4);
    border-radius: 28px;
    position: relative;
    padding: 1rem;
    backdrop-filter: blur(50px) saturate(180%);
    -webkit-backdrop-filter: blur(50px) saturate(180%);
}
.bento-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 28px;
    border: 1px solid transparent;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.2), transparent) border-box;
    -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
}

.main-amount { filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.4)); }

.neon-bar {
    box-shadow: 0 0 6px var(--glow-color), 0 0 12px var(--glow-color);
    background-color: var(--glow-color);
}
.glowing-bead {
    width: 10px; height: 10px; border-radius: 50%;
    background-color: var(--bead-color);
    box-shadow: 0 0 8px 2px var(--bead-color);
}

.bill-card { position: relative; padding: 0.5rem 1rem; background: rgba(255,255,255,0.05); border-radius: 1rem; display:flex; justify-content:space-between; align-items:center; }

.fab-container {
    perspective: 1000px;
    z-index: 50;
    animation: bounce-float 5s ease-in-out infinite;
}

@keyframes bounce-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-15px); }
}

.fab-shadow {
    position: absolute;
    bottom: -10px;
    left: 50%;
    width: 80%;
    height: 10px;
    background: black;
    border-radius: 50%;
    filter: blur(10px);
    opacity: 0.3;
    transform: translateX(-50%) scaleX(0.8);
    animation: shadow-scale 5s ease-in-out infinite;
}

@keyframes shadow-scale {
    0%, 100% { transform: translateX(-50%) scaleX(0.8); opacity: 0.3; }
    50% { transform: translateX(-50%) scaleX(1); opacity: 0.5; }
}

.fab-cube { 
    width: 38px; height: 38px; position: relative; transform-style: preserve-3d;
    transform: rotateX(-30deg) rotateY(-45deg);
    transition: transform 0.5s ease-out; cursor: pointer; 
}
.fab-container:hover .fab-cube { transform: rotateX(-20deg) rotateY(-35deg) scale(1.2); }

.face {
    position: absolute; width: 38px; height: 38px;
    background: rgba(80, 70, 220, 0.4);
    border: 1px solid rgba(160, 168, 255, 0.3);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    display: flex; justify-content: center; align-items: center;
    color: rgba(255, 255, 255, 0.4);
}
.inner-plus { font-size: 28px; line-height: 28px; opacity: 0.6; }

.front  { transform: translateZ(19px); }
.back   { transform: translateZ(-19px) rotateY(180deg); }
.right  { transform: rotateY(90deg) translateZ(19px); }
.left   { transform: rotateY(-90deg) translateZ(19px); }
.top    { transform: rotateX(90deg) translateZ(19px); }
.bottom { transform: rotateX(-90deg) translateZ(19px); }

/* Panel Styles */
.panel-content {
    background-color: rgba(25, 25, 45, 0.5);
    backdrop-filter: blur(50px) saturate(180%);
    -webkit-backdrop-filter: blur(50px) saturate(180%);
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 40px rgba(0,0,0,0.5);
    transition: box-shadow 0.4s ease-in-out;
}

.panel-glow-me {
    box-shadow: 0 0 50px rgba(76, 66, 254, 0.5);
}
.panel-glow-them {
    box-shadow: 0 0 50px rgba(255, 105, 62, 0.5);
}

.panel-float-enter-active, .panel-float-leave-active { transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
.panel-float-enter-from, .panel-float-leave-to { opacity: 0; transform: translateY(100%) scale(0.95); }

.keypad-key { 
    @apply bg-black/20 rounded-2xl flex items-center justify-center border border-white/10 transition-all duration-150 ease-in-out focus:outline-none;
}
.keypad-key:hover { transform: scale(1.05); background: rgba(255, 255, 255, 0.1); }
.keypad-key:active { @apply bg-black/30 scale-95; }

@keyframes breathing-glow-blue { 0%, 100% { box-shadow: 0 0 15px 5px rgba(76, 66, 254, 0.4); } 50% { box-shadow: 0 0 25px 10px rgba(76, 66, 254, 0.7); } }
@keyframes breathing-glow-pink { 0%, 100% { box-shadow: 0 0 15px 5px rgba(255, 105, 62, 0.4); } 50% { box-shadow: 0 0 25px 10px rgba(255, 105, 62, 0.7); } }

.payer-btn { @apply px-6 py-2 rounded-full text-lg font-semibold transition-all duration-300 bg-black/20 text-gray-300; }
.payer-active-me { @apply text-white; background-color: #4c42fe; animation: breathing-glow-blue 2s ease-in-out infinite; }
.payer-active-them { @apply text-white; background-color: #ff693e; animation: breathing-glow-pink 2s ease-in-out infinite; }

@keyframes ping-slow { 75%, 100% { transform: scale(2); opacity: 0; } }
.animate-ping-slow { animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* New slide-fade animation for delete button */
.slide-left-fade-enter-active,
.slide-left-fade-leave-active {
  transition: all 0.25s ease-out;
}
.slide-left-fade-enter-from,
.slide-left-fade-leave-to {
  transform: translateX(15px);
  opacity: 0;
}

.prompt-fade-enter-active,
.prompt-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.prompt-fade-enter-from,
.prompt-fade-leave-to {
  transform: translateY(30px) scale(0.95);
  opacity: 0;
}

</style>
