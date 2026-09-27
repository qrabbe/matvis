import './styles.css';
import { Header } from './features/header';
import { Flow } from './features/flow';

export function App() {
	return (
		<div className="page">
			<Header />
			<Flow />
		</div>
	);
}
