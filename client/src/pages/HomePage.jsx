import styles from './HomePage.module.css';
import Table from '../components/Table.jsx';
import Hand from '../components/Hand.jsx';
import Avatar from '../components/Avatar.jsx';

export default function HomePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>HAM Card Game</h1>
          <p className={styles.subtitle}>
            Minimal layout with core UI components.
          </p>
        </div>
        <div className={styles.meta}>
          <span className={styles.badge}>Lobby 001</span>
        </div>
      </header>
      <main className={styles.main}>
        <Table />
        <section className={styles.playerPanel}>
          <Avatar name="Player 1" status="Ready" />
          <Hand />
        </section>
      </main>
    </div>
  );
}
