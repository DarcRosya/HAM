import styles from './styles/App.module.css';
import HomePage from './pages/HomePage.jsx';

export default function App() {
  return (
    <div className={styles.app}>
      <HomePage />
    </div>
  );
}
