/* ============================================================
   所有旅程的卡片資料 — 新增旅程只要在這裡加一筆 + 建一個行程頁
   status: 'past'（已完成）| 'upcoming'（即將出發）| 'planning'（規劃中）
   ============================================================ */
const TRIPS = [
  {
    href: 'tokyo-2025.html',
    place: '東京',
    cover: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80',
    status: 'past',
    date: '2025年12月21日 — 25日',
    title: '東京之旅 with 夢夢',
    subtitle: '淺草 · 迪士尼 · 鎌倉 · 江之島',
    footer: '5天4夜 · 日本'
  },
  {
    href: 'hokkaido-2026.html',
    place: '北海道',
    cover: 'https://res.cloudinary.com/dahimm2nk/image/upload/w_600,q_auto,f_auto/v1774599765/beginnerPhoto_lndiyj.jpg',
    status: 'upcoming',
    date: '2026年9月5日 — 11日',
    title: '北海道之旅',
    subtitle: '札幌 · 旭山動物園 · 美瑛 · 小樽',
    footer: '7天6夜 · 日本'
  }
];

const TRIP_STATUS = {
  past: '已完成',
  upcoming: '即將出發',
  planning: '規劃中'
};
