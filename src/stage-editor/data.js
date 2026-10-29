// ============================================================
// data.js — Musicala Stage Patch
// Definiciones de categorías, equipos, cables y plantillas
// ============================================================

const CATEGORIES = [
  { id: 'instrument', label: 'Instrumentos / Fuentes', icon: '🎵' },
  { id: 'audio',      label: 'Audio y Conexiones',     icon: '🎛️' },
  { id: 'accessory',  label: 'Soportes y accesorios',  icon: '🧰' },
  { id: 'power',      label: 'Energía',                icon: '⚡' }
];

// Tipos de cable: color y etiqueta visual
const CONNECTION_TYPES = {
  xlr:     { label: 'XLR',          color: '#3B82F6' },
  ts:      { label: 'TS',           color: '#EAB308' },
  trs:     { label: 'TRS',          color: '#22C55E' },
  usb:     { label: 'USB',          color: '#8B5CF6' },
  power:   { label: 'Corriente',    color: '#EF4444' },
  speaker: { label: 'Parlante',     color: '#F97316' },
  rca:     { label: 'RCA',          color: '#EC4899' },
  midi:    { label: 'MIDI',         color: '#06B6D4' },
  other:   { label: 'Otro',         color: '#9CA3AF' }
};

// Compatibilidad de conectores para validar conexiones
const CONNECTOR_COMPAT = {
  xlr:     ['xlr'],
  ts:      ['ts', 'trs'],
  trs:     ['trs', 'ts'],
  usb:     ['usb'],
  power:   ['power'],
  speaker: ['speaker'],
  rca:     ['rca'],
  midi:    ['midi'],
  other:   ['other', 'xlr', 'ts', 'trs']
};

// ============================================================
// Biblioteca de equipos
// ============================================================
const DEVICE_TYPES = {

  // ── INSTRUMENTOS / FUENTES ──────────────────────────────
  vocal_main: {
    id: 'vocal_main', label: 'Voz principal', category: 'instrument', icon: '🎤',
    requiresPower: false, isSoundSource: true, needsDI: false,
    ports: [
      { id: 'out_xlr', label: 'Salida XLR', direction: 'out', connector: 'xlr', signal: 'mic' }
    ]
  },
  vocal_backing: {
    id: 'vocal_backing', label: 'Coro / Backing vocal', category: 'instrument', icon: '🎤',
    requiresPower: false, isSoundSource: true, needsDI: false,
    ports: [
      { id: 'out_xlr', label: 'Salida XLR', direction: 'out', connector: 'xlr', signal: 'mic' }
    ]
  },
  guitar_electric: {
    id: 'guitar_electric', label: 'Guitarra eléctrica', category: 'instrument', icon: '🎸',
    requiresPower: false, isSoundSource: true, needsDI: true,
    deviceOptions: [
      { key: 'battery', label: 'Activa (usa pila 9V)', type: 'checkbox', default: false }
    ],
    ports: [
      { id: 'out_ts', label: 'Salida instrumento', direction: 'out', connector: 'ts', signal: 'instrument' }
    ]
  },
  bass_electric: {
    id: 'bass_electric', label: 'Bajo eléctrico', category: 'instrument', icon: '🎸',
    requiresPower: false, isSoundSource: true, needsDI: true,
    deviceOptions: [
      { key: 'battery', label: 'Activo (usa pila 9V)', type: 'checkbox', default: false }
    ],
    ports: [
      { id: 'out_ts', label: 'Salida instrumento', direction: 'out', connector: 'ts', signal: 'instrument' }
    ]
  },
  guitar_pedals: {
    id: 'guitar_pedals', label: 'Pedal / Pedalera', category: 'instrument', icon: '🎚️',
    requiresPower: false, needsDI: false,
    deviceOptions: [
      { key: 'battery', label: 'Funciona con pila/batería', type: 'checkbox', default: false }
    ],
    ports: [
      { id: 'in_ts',  label: 'Entrada instrumento', direction: 'in',  connector: 'ts',    signal: 'instrument' },
      { id: 'out_ts', label: 'Salida a ampli/DI',   direction: 'out', connector: 'ts',    signal: 'instrument' },
      { id: 'pwr',    label: 'Corriente (opcional)', direction: 'in',  connector: 'power', signal: 'power'      }
    ]
  },
  keyboard_mono: {
    id: 'keyboard_mono', label: 'Teclado mono', category: 'instrument', icon: '🎹',
    requiresPower: true, isSoundSource: true, needsDI: true,
    ports: [
      { id: 'out_ts', label: 'Salida mono', direction: 'out', connector: 'ts', signal: 'line' },
      { id: 'pwr',    label: 'Corriente',   direction: 'in',  connector: 'power', signal: 'power' }
    ]
  },
  keyboard_stereo: {
    id: 'keyboard_stereo', label: 'Teclado estéreo', category: 'instrument', icon: '🎹',
    requiresPower: true, isSoundSource: true, needsDI: true, isStereo: true,
    ports: [
      { id: 'out_l', label: 'Salida L',  direction: 'out', connector: 'ts',    signal: 'line'  },
      { id: 'out_r', label: 'Salida R',  direction: 'out', connector: 'ts',    signal: 'line'  },
      { id: 'pwr',   label: 'Corriente', direction: 'in',  connector: 'power', signal: 'power' }
    ]
  },
  drum_kick: {
    id: 'drum_kick', label: 'Bombo', category: 'instrument', icon: '🥁',
    requiresPower: false, isSoundSource: true, isAcoustic: true,
    ports: [{ id: 'out_xlr', label: 'Mic sobre bombo', direction: 'out', connector: 'xlr', signal: 'mic' }]
  },
  drum_snare: {
    id: 'drum_snare', label: 'Redoblante', category: 'instrument', icon: '🥁',
    requiresPower: false, isSoundSource: true, isAcoustic: true,
    ports: [{ id: 'out_xlr', label: 'Mic sobre redoblante', direction: 'out', connector: 'xlr', signal: 'mic' }]
  },
  drum_overhead_l: {
    id: 'drum_overhead_l', label: 'Overhead L', category: 'instrument', icon: '🎵',
    requiresPower: false, isSoundSource: true, isAcoustic: true,
    ports: [{ id: 'out_xlr', label: 'Mic overhead L', direction: 'out', connector: 'xlr', signal: 'mic' }]
  },
  drum_overhead_r: {
    id: 'drum_overhead_r', label: 'Overhead R', category: 'instrument', icon: '🎵',
    requiresPower: false, isSoundSource: true, isAcoustic: true,
    ports: [{ id: 'out_xlr', label: 'Mic overhead R', direction: 'out', connector: 'xlr', signal: 'mic' }]
  },
  drum_full: {
    id: 'drum_full', label: 'Batería completa (drumset)', category: 'instrument', icon: '🥁',
    requiresPower: false, isSoundSource: true, isDrumset: true, isAcoustic: true,
    ports: [
      { id: 'out_kick',  label: 'Mic bombo',      direction: 'out', connector: 'xlr', signal: 'mic' },
      { id: 'out_snare', label: 'Mic redoblante', direction: 'out', connector: 'xlr', signal: 'mic' },
      { id: 'out_oh_l',  label: 'Overhead L',     direction: 'out', connector: 'xlr', signal: 'mic' },
      { id: 'out_oh_r',  label: 'Overhead R',     direction: 'out', connector: 'xlr', signal: 'mic' }
    ]
  },
  computer: {
    id: 'computer', label: 'Computador / Laptop', category: 'instrument', icon: '💻',
    requiresPower: true, isSoundSource: true, needsDI: true,
    ports: [
      { id: 'out_trs', label: 'Salida 3.5mm',  direction: 'out', connector: 'trs',   signal: 'line'    },
      { id: 'usb',     label: 'USB (interfaz)', direction: 'in',  connector: 'usb',   signal: 'digital' },
      { id: 'pwr',     label: 'Corriente',      direction: 'in',  connector: 'power', signal: 'power'   }
    ]
  },
  phone: {
    id: 'phone', label: 'Celular / Reproductor', category: 'instrument', icon: '📱',
    requiresPower: false, isSoundSource: true,
    ports: [{ id: 'out_trs', label: 'Salida 3.5mm', direction: 'out', connector: 'trs', signal: 'line' }]
  },

  // ── AUDIO Y CONEXIONES ──────────────────────────────────
  mic_dynamic: {
    id: 'mic_dynamic', label: 'Micrófono dinámico', category: 'audio', icon: '🎙️',
    requiresPower: false, isMic: true,
    deviceOptions: [
      { key: 'withStand', label: 'Incluir base de micrófono', type: 'checkbox', default: true }
    ],
    ports: [{ id: 'out_xlr', label: 'Salida XLR', direction: 'out', connector: 'xlr', signal: 'mic' }]
  },
  mic_condenser: {
    id: 'mic_condenser', label: 'Micrófono condensador', category: 'audio', icon: '🎙️',
    requiresPower: true, isPhantomPowered: true, isMic: true,
    deviceOptions: [
      { key: 'withStand', label: 'Incluir base de micrófono', type: 'checkbox', default: true }
    ],
    ports: [{ id: 'out_xlr', label: 'Salida XLR', direction: 'out', connector: 'xlr', signal: 'mic' }]
  },
  mic_headset_wireless: {
    id: 'mic_headset_wireless', label: 'Mic diadema inalámbrico', category: 'audio', icon: '🎤',
    requiresPower: false, isMic: true, isWireless: true, usesBattery: true,
    ports: [
      { id: 'out_ts', label: 'Salida receptor TS', direction: 'out', connector: 'ts', signal: 'line' }
    ]
  },
  mic_handheld_wireless: {
    id: 'mic_handheld_wireless', label: 'Mic de mano inalámbrico', category: 'audio', icon: '🎤',
    requiresPower: true, isMic: true, isWireless: true, usesBattery: true,
    ports: [
      { id: 'out_xlr', label: 'Salida receptor XLR', direction: 'out', connector: 'xlr',   signal: 'mic'   },
      { id: 'pwr',     label: 'Corriente (receptor)', direction: 'in',  connector: 'power', signal: 'power' }
    ]
  },
  di_passive: {
    id: 'di_passive', label: 'Caja directa pasiva', category: 'audio', icon: '📦',
    requiresPower: false, isDI: true,
    channelsConfigurable: true, dynamicPorts: 'di', defaultChannels: 1,
    // Cada canal: entrada TS (instrumento) + thru TS + salida XLR (ver diPorts en app.js)
    ports: [
      { id: 'in_ts_1',   label: 'Entrada TS', direction: 'in',  connector: 'ts',  signal: 'instrument' },
      { id: 'thru_1',    label: 'Thru TS',    direction: 'out', connector: 'ts',  signal: 'instrument' },
      { id: 'out_xlr_1', label: 'Salida XLR', direction: 'out', connector: 'xlr', signal: 'mic'        }
    ]
  },
  di_active: {
    id: 'di_active', label: 'Caja directa activa', category: 'audio', icon: '📦',
    requiresPower: true, isPhantomPowered: true, isDI: true,
    deviceOptions: [
      { key: 'powerMode', label: 'Alimentación', type: 'select', default: 'phantom_mixer', choices: [
        { value: 'phantom_mixer', label: 'Phantom +48V (desde mixer)' },
        { value: 'phantom_iface', label: 'Phantom +48V (desde interfaz)' },
        { value: 'battery',       label: 'Pila / batería interna' }
      ]}
    ],
    channelsConfigurable: true, dynamicPorts: 'di', defaultChannels: 1,
    // Los puertos se generan según el nº de canales (ver getPorts/diPorts en app.js)
    ports: [
      { id: 'in_ts_1',   label: 'Entrada TS',  direction: 'in',  connector: 'ts',  signal: 'instrument' },
      { id: 'thru_1',    label: 'Thru TS',     direction: 'out', connector: 'ts',  signal: 'instrument' },
      { id: 'out_xlr_1', label: 'Salida XLR',  direction: 'out', connector: 'xlr', signal: 'mic'        }
    ]
  },
  mixer: {
    id: 'mixer', label: 'Mixer / Consola', category: 'audio', icon: '🎛️',
    requiresPower: true, isDestination: true, isMixer: true,
    deviceOptions: [
      { key: 'phantom', label: 'Tiene phantom power +48V', type: 'checkbox', default: true }
    ],
    channelsConfigurable: true, dynamicPorts: 'mixer', defaultChannels: 8,
    channelOptions: [
      { value: 'xlr', label: 'XLR (mic)' },
      { value: 'trs', label: 'Línea (TS/TRS)' }
    ],
    // Los canales de entrada se generan dinámicamente (ver mixerPorts en app.js).
    // Estos puertos quedan solo como referencia/fallback.
    ports: [
      { id: 'in_1',        label: 'Canal 1 XLR',    direction: 'in',  connector: 'xlr',   signal: 'mic'   },
      { id: 'in_2',        label: 'Canal 2 XLR',    direction: 'in',  connector: 'xlr',   signal: 'mic'   },
      { id: 'in_3',        label: 'Canal 3 XLR',    direction: 'in',  connector: 'xlr',   signal: 'mic'   },
      { id: 'in_4',        label: 'Canal 4 XLR',    direction: 'in',  connector: 'xlr',   signal: 'mic'   },
      { id: 'in_5',        label: 'Canal 5 Line',   direction: 'in',  connector: 'trs',   signal: 'line'  },
      { id: 'in_6',        label: 'Canal 6 Line',   direction: 'in',  connector: 'trs',   signal: 'line'  },
      { id: 'in_7',        label: 'Canal 7 Line',   direction: 'in',  connector: 'trs',   signal: 'line'  },
      { id: 'in_8',        label: 'Canal 8 Line',   direction: 'in',  connector: 'trs',   signal: 'line'  },
      { id: 'out_main_l',  label: 'Main Out L',     direction: 'out', connector: 'xlr',   signal: 'line'  },
      { id: 'out_main_r',  label: 'Main Out R',     direction: 'out', connector: 'xlr',   signal: 'line'  },
      { id: 'aux_1',       label: 'Aux 1 / Monitor',direction: 'out', connector: 'xlr',   signal: 'line'  },
      { id: 'aux_2',       label: 'Aux 2 / Monitor',direction: 'out', connector: 'xlr',   signal: 'line'  },
      { id: 'pwr',         label: 'Corriente',      direction: 'in',  connector: 'power', signal: 'power' }
    ]
  },
  audio_interface: {
    id: 'audio_interface', label: 'Interfaz de audio', category: 'audio', icon: '🎛️',
    requiresPower: false, isDestination: true, isInterface: true,
    deviceOptions: [
      { key: 'phantom', label: 'Tiene phantom power +48V', type: 'checkbox', default: true }
    ],
    channelsConfigurable: true, dynamicPorts: 'interface', defaultChannels: 2,
    // Entradas combo: cada canal admite XLR o TS (no ambos a la vez).
    channelOptions: [
      { value: 'xlr', label: 'XLR (mic)' },
      { value: 'ts',  label: 'TS (instrumento/línea)' }
    ],
    // Puertos de referencia/fallback (se generan según los canales en ifacePorts).
    ports: [
      { id: 'in_1',   label: 'Input 1 XLR',    direction: 'in',  connector: 'xlr', signal: 'mic'     },
      { id: 'in_2',   label: 'Input 2 XLR',    direction: 'in',  connector: 'xlr', signal: 'mic'     },
      { id: 'out_l',  label: 'Output L',        direction: 'out', connector: 'trs', signal: 'line'    },
      { id: 'out_r',  label: 'Output R',        direction: 'out', connector: 'trs', signal: 'line'    },
      { id: 'out_hp', label: 'Salida audífonos',direction: 'out', connector: 'trs', signal: 'line'    },
      { id: 'usb',    label: 'USB a computador',direction: 'out', connector: 'usb', signal: 'digital' }
    ]
  },
  stagebox: {
    id: 'stagebox', label: 'Stagebox / Snake', category: 'audio', icon: '📡',
    requiresPower: false, isDestination: true,
    ports: [
      { id: 'in_1',     label: 'Canal 1',       direction: 'in',  connector: 'xlr', signal: 'mic'  },
      { id: 'in_2',     label: 'Canal 2',       direction: 'in',  connector: 'xlr', signal: 'mic'  },
      { id: 'in_3',     label: 'Canal 3',       direction: 'in',  connector: 'xlr', signal: 'mic'  },
      { id: 'in_4',     label: 'Canal 4',       direction: 'in',  connector: 'xlr', signal: 'mic'  },
      { id: 'out_snake',label: 'A consola FOH', direction: 'out', connector: 'xlr', signal: 'line' }
    ]
  },
  speaker_active: {
    id: 'speaker_active', label: 'Parlante activo', category: 'audio', icon: '🔊',
    requiresPower: true, isOutput: true, isSpeaker: true,
    ports: [
      { id: 'in_xlr', label: 'Entrada XLR', direction: 'in', connector: 'xlr',   signal: 'line'  },
      { id: 'in_trs', label: 'Entrada TRS', direction: 'in', connector: 'trs',   signal: 'line'  },
      { id: 'pwr',    label: 'Corriente',   direction: 'in', connector: 'power', signal: 'power' }
    ]
  },
  monitor_floor: {
    id: 'monitor_floor', label: 'Monitor de piso activo', category: 'audio', icon: '📢',
    requiresPower: true, isOutput: true, isMonitor: true,
    ports: [
      { id: 'in_xlr', label: 'Entrada XLR', direction: 'in', connector: 'xlr',   signal: 'line'  },
      { id: 'in_trs', label: 'Entrada TRS', direction: 'in', connector: 'trs',   signal: 'line'  },
      { id: 'pwr',    label: 'Corriente',   direction: 'in', connector: 'power', signal: 'power' }
    ]
  },
  headphones: {
    id: 'headphones', label: 'Audífonos / In-ear', category: 'audio', icon: '🎧',
    requiresPower: false, isOutput: true,
    ports: [{ id: 'in_trs', label: 'Entrada TRS', direction: 'in', connector: 'trs', signal: 'line' }]
  },
  amp_guitar: {
    id: 'amp_guitar', label: 'Ampli guitarra', category: 'audio', icon: '🔌',
    requiresPower: true, isAmplifier: true, dynamicPorts: 'amp',
    deviceOptions: [
      { key: 'output', label: 'Salida hacia consola', type: 'select', default: 'mic_only', choices: [
        { value: 'mic_only', label: 'Microfoniado (mic externo, XLR)' },
        { value: 'xlr_di',   label: 'DI Out / XLR balanceada' },
        { value: 'ts_line',  label: 'Salida de línea TS' }
      ]}
    ],
    ports: [
      { id: 'in_ts',   label: 'Entrada instrumento', direction: 'in',  connector: 'ts',    signal: 'instrument' },
      { id: 'out_mic', label: 'Salida (microfoniado)',direction: 'out', connector: 'xlr',   signal: 'mic'        },
      { id: 'pwr',     label: 'Corriente',            direction: 'in',  connector: 'power', signal: 'power'      }
    ]
  },
  amp_bass: {
    id: 'amp_bass', label: 'Ampli bajo', category: 'audio', icon: '🔌',
    requiresPower: true, isAmplifier: true, dynamicPorts: 'amp',
    deviceOptions: [
      { key: 'output', label: 'Salida hacia consola', type: 'select', default: 'xlr_di', choices: [
        { value: 'xlr_di',   label: 'DI Out / XLR balanceada' },
        { value: 'mic_only', label: 'Microfoniado (mic externo, XLR)' },
        { value: 'ts_line',  label: 'Salida de línea TS' }
      ]}
    ],
    ports: [
      { id: 'in_ts',  label: 'Entrada instrumento', direction: 'in',  connector: 'ts',    signal: 'instrument' },
      { id: 'out_di', label: 'DI Out / XLR',        direction: 'out', connector: 'xlr',   signal: 'mic'        },
      { id: 'pwr',    label: 'Corriente',            direction: 'in',  connector: 'power', signal: 'power'      }
    ]
  },

  // ── SOPORTES Y ACCESORIOS ───────────────────────────────
  stand_mic_straight: {
    id: 'stand_mic_straight', label: 'Base de micrófono recta', category: 'accessory', icon: '🎙️',
    isAccessory: true, ports: []
  },
  stand_mic_boom: {
    id: 'stand_mic_boom', label: 'Base de micrófono jirafa', category: 'accessory', icon: '🎙️',
    isAccessory: true, ports: []
  },
  music_stand: {
    id: 'music_stand', label: 'Atril de partitura', category: 'accessory', icon: '🎼',
    isAccessory: true, ports: []
  },
  stand_guitar: {
    id: 'stand_guitar', label: 'Soporte de guitarra (piso)', category: 'accessory', icon: '🎸',
    isAccessory: true, ports: []
  },
  stand_bass: {
    id: 'stand_bass', label: 'Soporte de bajo (piso)', category: 'accessory', icon: '🎸',
    isAccessory: true, ports: []
  },
  stand_keyboard: {
    id: 'stand_keyboard', label: 'Soporte de teclado', category: 'accessory', icon: '🎹',
    isAccessory: true, ports: []
  },
  drum_rug: {
    id: 'drum_rug', label: 'Alfombra de batería', category: 'accessory', icon: '🟫',
    isAccessory: true, ports: []
  },
  drum_throne: {
    id: 'drum_throne', label: 'Banco / silla de batería', category: 'accessory', icon: '🪑',
    isAccessory: true, ports: []
  },
  iem_pack: {
    id: 'iem_pack', label: 'Audífonos / In-ear', category: 'accessory', icon: '🎧',
    isAccessory: true, ports: []
  },

  // ── ENERGÍA ────────────────────────────────────────────
  power_outlet: {
    id: 'power_outlet', label: 'Toma de corriente', category: 'power', icon: '🔌',
    isPowerSource: true, requiresPower: false,
    ports: [
      { id: 'out_1', label: 'Corriente 1', direction: 'out', connector: 'power', signal: 'power' },
      { id: 'out_2', label: 'Corriente 2', direction: 'out', connector: 'power', signal: 'power' }
    ]
  },
  extension: {
    id: 'extension', label: 'Extensión', category: 'power', icon: '🔗',
    isPowerSource: true, requiresPower: true,
    channelsConfigurable: true, dynamicPorts: 'power', defaultChannels: 2,
    ports: [
      { id: 'in_pwr', label: 'Entrada corriente', direction: 'in',  connector: 'power', signal: 'power' },
      { id: 'out_1',  label: 'Salida 1',           direction: 'out', connector: 'power', signal: 'power' },
      { id: 'out_2',  label: 'Salida 2',           direction: 'out', connector: 'power', signal: 'power' }
    ]
  },
  power_strip: {
    id: 'power_strip', label: 'Multitoma / Regleta', category: 'power', icon: '⚡',
    isPowerSource: true, requiresPower: true,
    channelsConfigurable: true, dynamicPorts: 'power', defaultChannels: 6,
    ports: [
      { id: 'in_pwr', label: 'Entrada corriente', direction: 'in',  connector: 'power', signal: 'power' },
      { id: 'out_1',  label: 'Salida 1',           direction: 'out', connector: 'power', signal: 'power' },
      { id: 'out_2',  label: 'Salida 2',           direction: 'out', connector: 'power', signal: 'power' },
      { id: 'out_3',  label: 'Salida 3',           direction: 'out', connector: 'power', signal: 'power' },
      { id: 'out_4',  label: 'Salida 4',           direction: 'out', connector: 'power', signal: 'power' },
      { id: 'out_5',  label: 'Salida 5',           direction: 'out', connector: 'power', signal: 'power' },
      { id: 'out_6',  label: 'Salida 6',           direction: 'out', connector: 'power', signal: 'power' }
    ]
  }
};

// ============================================================
// Plantillas rápidas
// ============================================================
const TEMPLATES = {
  rock_band: {
    label: 'Banda rock básica',
    elements: [
      { typeId: 'vocal_main',      x: 280, y: 100, name: 'Voz principal'   },
      { typeId: 'mic_dynamic',     x: 280, y: 30,  name: 'Mic voz 1'       },
      { typeId: 'vocal_backing',   x: 470, y: 100, name: 'Coro'            },
      { typeId: 'mic_dynamic',     x: 470, y: 30,  name: 'Mic voz 2'       },
      { typeId: 'guitar_electric', x: 700, y: 140, name: 'Guitarra'         },
      { typeId: 'amp_guitar',      x: 860, y: 140, name: 'Ampli guitarra'   },
      { typeId: 'bass_electric',   x: 700, y: 300, name: 'Bajo'            },
      { typeId: 'di_passive',      x: 860, y: 300, name: 'DI Bajo'         },
      { typeId: 'keyboard_stereo', x: 280, y: 300, name: 'Teclado estéreo' },
      { typeId: 'di_passive',      x: 440, y: 270, name: 'DI Tecla L'      },
      { typeId: 'di_passive',      x: 440, y: 360, name: 'DI Tecla R'      },
      { typeId: 'drum_kick',       x: 1050, y: 160, name: 'Bombo'          },
      { typeId: 'drum_snare',      x: 1050, y: 260, name: 'Redoblante'     },
      { typeId: 'drum_overhead_l', x: 1050, y: 360, name: 'Overhead L'     },
      { typeId: 'drum_overhead_r', x: 1050, y: 450, name: 'Overhead R'     },
      { typeId: 'mixer',           x: 560,  y: 560, name: 'Mixer'          },
      { typeId: 'speaker_active',  x: 80,   y: 600, name: 'Parlante L'     },
      { typeId: 'speaker_active',  x: 1100, y: 600, name: 'Parlante R'     },
      { typeId: 'monitor_floor',   x: 340,  y: 490, name: 'Monitor 1'      },
      { typeId: 'monitor_floor',   x: 780,  y: 490, name: 'Monitor 2'      },
      { typeId: 'power_strip',     x: 560,  y: 720, name: 'Regleta escenario' }
    ]
  },
  musicala_class: {
    label: 'Clase / presentación Musicala',
    elements: [
      { typeId: 'vocal_main',      x: 200, y: 120, name: 'Voz'            },
      { typeId: 'mic_dynamic',     x: 200, y: 40,  name: 'Micrófono'      },
      { typeId: 'guitar_electric', x: 450, y: 120, name: 'Guitarra'        },
      { typeId: 'keyboard_stereo', x: 700, y: 120, name: 'Teclado'        },
      { typeId: 'computer',        x: 700, y: 280, name: 'Computador'     },
      { typeId: 'audio_interface', x: 450, y: 300, name: 'Interfaz'       },
      { typeId: 'speaker_active',  x: 140, y: 420, name: 'Parlante'       },
      { typeId: 'monitor_floor',   x: 700, y: 420, name: 'Monitor'        },
      { typeId: 'power_strip',     x: 420, y: 480, name: 'Multitoma'      }
    ]
  },
  rehearsal: {
    label: 'Ensayo simple',
    elements: [
      { typeId: 'vocal_main',    x: 160, y: 100, name: 'Voz 1'   },
      { typeId: 'vocal_backing', x: 380, y: 100, name: 'Voz 2'   },
      { typeId: 'bass_electric', x: 600, y: 100, name: 'Bajo'    },
      { typeId: 'guitar_electric', x: 600, y: 260, name: 'Guitarra' },
      { typeId: 'keyboard_stereo', x: 160, y: 260, name: 'Teclado' },
      { typeId: 'di_passive',    x: 760, y: 100, name: 'DI Bajo' },
      { typeId: 'mixer',         x: 360, y: 420, name: 'Mixer'   },
      { typeId: 'speaker_active',x: 600, y: 460, name: 'Parlante'},
      { typeId: 'power_strip',   x: 160, y: 460, name: 'Multitoma'}
    ]
  }
};
// Tipos adicionales usados por los montajes de Eventos.
Object.assign(DEVICE_TYPES, {
  person: {id:'person',label:'Integrante',category:'accessory',icon:'👤',ports:[],isPerson:true},
  generic_resource: {id:'generic_resource',label:'Recurso / equipo',category:'accessory',icon:'📦',ports:[],isAccessory:true},
  chair: {id:'chair',label:'Silla sin brazos',category:'accessory',icon:'🪑',ports:[],isAccessory:true},
  riser: {id:'riser',label:'Tarima',category:'accessory',icon:'🟪',ports:[],isAccessory:true},
  curtain: {id:'curtain',label:'Telón / estructura',category:'accessory',icon:'🎭',ports:[],isAccessory:true},
  lights: {id:'lights',label:'Luces',category:'accessory',icon:'💡',ports:[],isAccessory:true},
  camera_tripod: {id:'camera_tripod',label:'Trípode de cámara',category:'accessory',icon:'📷',ports:[],isAccessory:true},
  guitar_acoustic: {id:'guitar_acoustic',label:'Guitarra acústica',category:'instrument',icon:'🎸',ports:[],isSoundSource:true,isAcoustic:true},
  violin: {id:'violin',label:'Violín',category:'instrument',icon:'🎻',ports:[],isSoundSource:true,isAcoustic:true},
  cello: {id:'cello',label:'Cello',category:'instrument',icon:'🎻',ports:[],isSoundSource:true,isAcoustic:true},
  flute: {id:'flute',label:'Flauta',category:'instrument',icon:'🪈',ports:[],isSoundSource:true,isAcoustic:true},
  saxophone: {id:'saxophone',label:'Saxofón',category:'instrument',icon:'🎷',ports:[],isSoundSource:true,isAcoustic:true},
  trumpet: {id:'trumpet',label:'Trompeta',category:'instrument',icon:'🎺',ports:[],isSoundSource:true,isAcoustic:true},
  percussion: {id:'percussion',label:'Percusión',category:'instrument',icon:'🪘',ports:[],isSoundSource:true,isAcoustic:true}
});
