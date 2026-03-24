// ==========================================
// data/fcn_scenarios.js
// FCN 情境庫（完整庫，可放 20 組以上）
// ==========================================

export const FCN_SCENARIOS = [
  {
    id: "S01",
    name: "最保守組A",
    rate: 12,
    period: 12,
    ki: 50,
    strike: 60,
    eki: true,
    basketSize: 3
  },
  {
    id: "S02",
    name: "次保守組A",
    rate: 12,
    period: 9,
    ki: 50,
    strike: 60,
    eki: true,
    basketSize: 3
  },
  {
    id: "S03",
    name: "保守組A",
    rate: 15,
    period: 9,
    ki: 50,
    strike: 60,
    eki: true,
    basketSize: 4
  },
  {
    id: "S04",
    name: "正常組A",
    rate: 15,
    period: 9,
    ki: 55,
    strike: 70,
    eki: true,
    basketSize: 4
  },
  {
    id: "S05",
    name: "正常組B",
    rate: 15,
    period: 9,
    ki: 55,
    strike: 70,
    eki: false,
    basketSize: 3
  },
  {
    id: "S06",
    name: "正常組C",
    rate: 18,
    period: 9,
    ki: 55,
    strike: 65,
    eki: true,
    basketSize: 3
  },
  {
    id: "S07",
    name: "正常組D",
    rate: 18,
    period: 9,
    ki: 55,
    strike: 65,
    eki: false,
    basketSize: 3
  },
  {
    id: "S08",
    name: "正常組E",
    rate: 18,
    period: 6,
    ki: 55,
    strike: 70,
    eki: true,
    basketSize: 4
  },
  {
    id: "S09",
    name: "正常組F",
    rate: 18,
    period: 6,
    ki: 55,
    strike: 70,
    eki: false,
    basketSize: 4
  },
  {
    id: "S10",
    name: "積極組A",
    rate: 22,
    period: 9,
    ki: 55,
    strike: 70,
    eki: true,
    basketSize: 5
  },
  {
    id: "S11",
    name: "積極組B",
    rate: 24,
    period: 9,
    ki: 55,
    strike: 70,
    eki: false,
    basketSize: 5
  },
  {
    id: "S12",
    name: "期望組C",
    rate: 20,
    period: 9,
    ki: 55,
    strike: 70,
    eki: true,
    basketSize: 5
  },
  {
    id: "S13",
    name: "期望組D",
    rate: 20,
    period: 9,
    ki: 50,
    strike: 70,
    eki: false,
    basketSize: 5
  },
  {
    id: "S14",
    name: "夢幻組A",
    rate: 17,
    period: 3,
    ki: 55,
    strike: 70,
    eki: true,
    basketSize: 3
  },
  {
    id: "S15",
    name: "夢幻組B",
    rate: 18,
    period: 6,
    ki: 55,
    strike: 70,
    eki: false,
    basketSize: 4
  },
  {
    id: "S16",
    name: "夢幻組C",
    rate: 22,
    period: 9,
    ki: 55,
    strike: 70,
    eki: true,
    basketSize: 5
  },
  {
    id: "S17",
    name: "夢幻組D",
    rate: 24,
    period: 12,
    ki: 55,
    strike: 70,
    eki: false,
    basketSize: 5
  },
  {
    id: "S18",
    name: "接股組A",
    rate: 30,
    period: 2,
    ki: 65,
    strike: 80,
    eki: true,
    basketSize: 3
  },
  {
    id: "S19",
    name: "接股組B",
    rate: 30,
    period: 2,
    ki: 70,
    strike: 85,
    eki: true,
    basketSize: 4
  },
  {
    id: "S20",
    name: "接股組C",
    rate: 15,
    period: 3,
    ki: 70,
    strike: 80,
    eki: false,
    basketSize: 5
  }
];
