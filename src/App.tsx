import React, { useEffect } from 'react';
import { initVisualizer } from './visualizer-engine';
import './app.css';
import Header from './components/Header';
import EventLogAndWorkspace from './components/EventLogAndWorkspace';
import Timeline from './components/Timeline';
import Tooltip from './components/Tooltip';
import ConfigurationDialog from './components/ConfigurationDialog';

function App() {
  useEffect(() => {
    initVisualizer();
  }, []);

  return (
    <>
      <Header />
      <EventLogAndWorkspace />
      <Timeline />
      <Tooltip />
      <ConfigurationDialog />
    </>
  );
}

export default App;
