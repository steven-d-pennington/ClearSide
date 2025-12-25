import { useState } from 'react';
import './styles/tokens.css';
import './App.css';
import { Button, Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge, Alert } from './components/ui';
import { InputForm } from './components/InputForm';
import { DebateStream } from './components/DebateStream';
import { useDebateStore } from './stores/debate-store';

function App() {
  const [showDemo, setShowDemo] = useState(false);
  const debate = useDebateStore((state) => state.debate);

  return (
    <div className="app">
      <header className="app-header">
        <h1>ClearSide</h1>
        <p className="tagline">Watch the debate. Think both sides. Decide with clarity.</p>
      </header>

      <main className="app-main">
        {/* Show InputForm when no debate, show DebateStream when debate exists */}
        {!debate ? (
          <Card padding="lg" variant="elevated">
            <InputForm
              onSuccess={(debateId) => console.log('Debate started:', debateId)}
              onError={(error) => console.error('Error:', error)}
            />
            <CardFooter>
              <Button
                variant="secondary"
                onClick={() => setShowDemo(!showDemo)}
              >
                {showDemo ? 'Hide Demo Components' : 'Show Demo Components'}
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <DebateStream />
        )}

        {showDemo && (
          <section className="demo-section">
            <h2>Design System Components</h2>

            <div className="demo-group">
              <h3>Buttons</h3>
              <div className="demo-row">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="pro">Pro</Button>
                <Button variant="con">Con</Button>
              </div>
              <div className="demo-row">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
              <div className="demo-row">
                <Button loading>Loading</Button>
                <Button disabled>Disabled</Button>
              </div>
            </div>

            <div className="demo-group">
              <h3>Badges</h3>
              <div className="demo-row">
                <Badge>Default</Badge>
                <Badge variant="primary">Primary</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="error">Error</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="info">Info</Badge>
              </div>
              <div className="demo-row">
                <Badge variant="pro">Pro</Badge>
                <Badge variant="con">Con</Badge>
                <Badge variant="moderator">Moderator</Badge>
              </div>
              <div className="demo-row">
                <Badge variant="success" dot>Live</Badge>
                <Badge variant="warning" dot>Pending</Badge>
              </div>
            </div>

            <div className="demo-group">
              <h3>Inputs</h3>
              <div className="demo-stack">
                <Input label="Email" placeholder="Enter your email" />
                <Input label="With Error" error="This field is required" />
                <Input label="With Helper" helperText="We'll never share your email" />
                <Input label="Disabled" disabled value="Cannot edit" />
              </div>
            </div>

            <div className="demo-group">
              <h3>Alerts</h3>
              <div className="demo-stack">
                <Alert variant="info" title="Information">
                  This is an informational message.
                </Alert>
                <Alert variant="success" title="Success">
                  Your action was completed successfully.
                </Alert>
                <Alert variant="warning" title="Warning">
                  Please review before proceeding.
                </Alert>
                <Alert variant="error" title="Error">
                  Something went wrong. Please try again.
                </Alert>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
