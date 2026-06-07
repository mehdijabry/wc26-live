import { Navigation } from './components/Navigation'
import { Hero } from './components/Hero'
import { Groups } from './components/Groups'
import { Schedule } from './components/Schedule'
import { Bracket } from './components/Bracket'
import { Stadiums } from './components/Stadiums'
import { Predictions } from './components/Predictions'
import { Players } from './components/Players'
import { Footer } from './components/Footer'
import { AtlasLions } from './components/AtlasLions'

function App() {
  return (
    <div className="min-h-svh">
      <Navigation />
      <main>
        <Hero />
        <Groups />
        <Schedule />
        <Bracket />
        <Stadiums />
        <Players />
        <Predictions />
      </main>
      <Footer />
      <AtlasLions />
    </div>
  )
}

export default App
