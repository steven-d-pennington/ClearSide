import { useState } from 'react';
import './styles/tokens.css';
import './App.css';
import { Button, Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge, Alert } from './components/ui';

function App() {
  const [proposition, setProposition] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <h1>ClearSide</h1>
        <p className="tagline">Watch the debate. Think both sides. Decide with clarity.</p>
      </header>

      <main className="app-main">
        <Card padding="lg" variant="elevated">
          <CardHeader>
            <CardTitle>Start a New Debate</CardTitle>
            <CardDescription>
              Enter a proposition to explore through structured adversarial debate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              label="Proposition"
              placeholder="Enter a debatable proposition, e.g., 'The United States should implement a moratorium on new AI data centers'"
              value={proposition}
              onChange={(e) => setProposition(e.target.value)}
              fullWidth
              rows={3}
              helperText="A good proposition is specific, debatable, and has strong arguments on both sides."
            />
          </CardContent>
          <CardFooter>
            <Button
              variant="secondary"
              onClick={() => setShowDemo(!showDemo)}
            >
              {showDemo ? 'Hide Demo' : 'Show Demo Components'}
            </Button>
            <Button
              variant="primary"
              disabled={!proposition.trim()}
            >
              Start Debate
            </Button>
          </CardFooter>
        </Card>

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
