import styles from './styles/App.module.css';
import HomePage from './pages/HomePage.jsx';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Lobby from "./pages/Lobby";
import Battle from "./pages/Battle";

export default function App() {
  return (
    <BrowserRouter>
      <div className={styles.app}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/battle" element={<Battle />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
