import './styles.css';
import { Header } from './features/Header';
import { Flow } from './features/Flow';

export function App() {
  return (
    <div className="page">
      <Header />
      <Flow />
    </div>
  );
}
