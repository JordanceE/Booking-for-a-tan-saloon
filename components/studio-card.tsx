"use client";
import { Clock3, Leaf, MapPin, Sun } from "lucide-react";
export default function StudioCard() {
  return (
    <aside className="studio-panel">
      <div className="studio-visual" aria-hidden="true">
        <span className="bed-label">THE SUNROOM EXPERIENCE</span>
        <div className="bed-arch">
          <div className="bed-lines" />
        </div>
        <div className="bed-base" />
        <Sun className="bed-sun" size={29} strokeWidth={1.2} />
        <span className="visual-number">01</span>
      </div>
      <div className="studio-details">
        <span className="tiny-label">YOUR MOMENT OF WARMTH</span>
        <h3>The classic glow</h3>
        <p>
          Our signature tanning bed session.
          <br />A little escape from the everyday.
        </p>
        <ul className="session-facts">
          <li>
            <Clock3 size={17} />
            Flexible session lengths
          </li>
          <li>
            <MapPin size={17} />
            Sunroom Studio · Bed 01
          </li>
          <li>
            <Leaf size={17} />
            Your own private space
          </li>
        </ul>
        <div className="studio-note">
          <Sun size={18} />
          <p>New around here? Our studio team will help you settle in.</p>
        </div>
      </div>
    </aside>
  );
}
