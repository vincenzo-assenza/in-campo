import PollScreen from './PollScreen.jsx';
import TournamentScreen from './TournamentScreen.jsx';

export default function App() {
  const qs = new URLSearchParams(window.location.search);
  const date = qs.get('date');
  if (qs.get('view') === 'tournament' && date) {
    return <TournamentScreen date={date} />;
  }
  return <PollScreen />;
}
