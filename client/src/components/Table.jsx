import styles from './Table.module.css';

export default function Table() {
  return (
    <section className={styles.table}>
      <h2 className={styles.title}>Table</h2>
      <p className={styles.subtitle}>Waiting for players...</p>
    </section>
  );
}
