import { useEffect, useRef, useState } from 'react';
import { play } from '../audio';
import { useCountdown } from '../hooks/useCountdown';
import { send } from '../protocol/roomClient';

type Step = 'wait' | 'go' | 'done' | 'early';

/**
 * Surprise reaction test: hit the pad the moment it turns green. The result
 * (0-100, higher is more human-like) goes to the server and feeds the sus
 * meter. Nothing here says who is or isn't the AI.
 */
export function TuringCheckPanel({ endsAt }: { endsAt: number }) {
  const [step, setStep] = useState<Step>('wait');
  const [millis, setMillis] = useState(0);
  const greenAt = useRef(0);
  const seconds = useCountdown(endsAt);

  useEffect(() => {
    play('alarm');
    const timer = setTimeout(() => { greenAt.current = performance.now(); setStep((now) => (now === 'wait' ? 'go' : now)); }, 700 + Math.random() * 1300);
    return () => clearTimeout(timer);
  }, []);

  function hit() {
    if (step === 'wait') {
      setStep('early');
      send.turingResult(20); // jumping the gun reads as a poor result
    } else if (step === 'go') {
      const reaction = performance.now() - greenAt.current;
      setMillis(Math.round(reaction));
      setStep('done');
      // About 180 ms scores 100; every extra 6 ms costs a point.
      send.turingResult(Math.max(5, Math.min(100, Math.round(100 - (reaction - 180) / 6))));
      play('score');
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.code === 'Space') { event.preventDefault(); hit(); } };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const finished = step === 'done' || step === 'early';
  return (
    <div className="backdrop backdrop--machine ui">
      <div className="machine turing" role="dialog" aria-modal="true" aria-label="Turing check">
        <h2>Turing check</h2>
        <p>{finished ? 'Result logged. It feeds the sus meter.' : 'Hit the pad (or press Space) the instant it turns green.'}</p>
        <button className={`pad pad--${step}`} onClick={hit} disabled={finished} autoFocus>
          {step === 'wait' && 'Wait for it…'}
          {step === 'go' && 'NOW!'}
          {step === 'done' && `${millis} ms`}
          {step === 'early' && 'Too early'}
        </button>
        <div className="progress" aria-hidden="true"><span style={{ width: `${Math.min(100, seconds * 20)}%` }} /></div>
        <small className="muted">{seconds}s left</small>
      </div>
    </div>
  );
}
