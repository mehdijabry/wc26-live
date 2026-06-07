import { useEffect } from 'react'
import { Navigation } from './components/Navigation'
import { StickyCountdown } from './components/StickyCountdown'
import { Hero } from './components/Hero'
import { Groups } from './components/Groups'
import { Schedule } from './components/Schedule'
import { Bracket } from './components/Bracket'
import { Stadiums } from './components/Stadiums'
import { Predictions } from './components/Predictions'
import { Players } from './components/Players'
import { Leaderboard } from './components/Leaderboard'
import { DailyMatches } from './components/DailyMatches'
import { Footer } from './components/Footer'
import { AtlasLions } from './components/AtlasLions'
import { useAuth } from './store/auth'
import { usePredictions } from './store/predictions'

function App() {
  const authInit = useAuth((s) => s.init)
  const user = useAuth((s) => s.user)
  const syncFromCloud = usePredictions((s) => s.syncFromCloud)
  const pushLocalToCloud = usePredictions((s) => s.pushLocalToCloud)

  // Init auth on mount
  useEffect(() => {
    authInit()
  }, [authInit])

  // When user logs in: push any local picks to cloud, then pull
  useEffect(() => {
    if (!user) return
    ;(async () => {
      await pushLocalToCloud()
      await syncFromCloud()
    })()
  }, [user, pushLocalToCloud, syncFromCloud])

  return (
    <div className="min-h-svh">
      <Navigation />
      <StickyCountdown />
      <main>
        <Hero />
        <Groups />
        <Schedule />
        <Bracket />
        <Stadiums />
        <Players />
        <Predictions />
        <Leaderboard />
        <DailyMatches />
      </main>
      <Footer />
      <AtlasLions />
    </div>
  )
}

export default App
