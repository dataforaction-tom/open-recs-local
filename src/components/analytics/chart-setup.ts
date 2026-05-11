'use client';

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

/**
 * One-shot Chart.js v4 module registration. Each chart component imports
 * this module for its side-effect; modules are evaluated once, so the
 * registration runs exactly once per page render.
 *
 * Tree-shaken set: only the elements + scales the four phase-9 charts
 * actually use. Add more here if a future chart needs them.
 */
Chart.register(
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);
