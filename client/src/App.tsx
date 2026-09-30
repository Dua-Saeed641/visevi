import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Analytics } from './pages/Analytics'
import { Compare } from './pages/Compare'
import { Graph } from './pages/Graph'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { Report } from './pages/Report'
import { Timeline } from './pages/Timeline'
import { Upload } from './pages/Upload'
import { Watch } from './pages/Watch'

function App() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route element={<Layout />}>
        <Route path="dashboard" element={<Analytics />} />
        <Route path="library" element={<Library />} />
        <Route path="compare" element={<Compare />} />
        <Route path="report" element={<Report />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="graph" element={<Graph />} />
        <Route path="watch" element={<Watch />} />
        <Route path="upload" element={<Upload />} />
      </Route>
    </Routes>
  )
}

export default App
