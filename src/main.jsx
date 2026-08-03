import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

/* AG Grid 모듈 등록 + 전역 기본값 (한글 문구 등 — constants/agGrid.js 참고) */
import { ModuleRegistry, AllCommunityModule, provideGlobalGridOptions } from "ag-grid-community";
import { AG_GRID_LOCALE_KO } from "@/constants/agGrid";

ModuleRegistry.registerModules([AllCommunityModule]);
provideGlobalGridOptions({ localeText: AG_GRID_LOCALE_KO });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
