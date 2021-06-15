import index, { getSlug } from './react-index'
import { createAsyncThunk } from '@reduxjs/toolkit'
import api from './api'

const Terms = {
  groups: {
    date_range: 'ALL_TIME',
    business_id: null,
    service: ["ADWORDS", "BINGADS"],
    status: 0,
  },
  filters: {
    term: "",
    order: 'descend',
    order_key: 'impressions',
    calculated: null,
    page: 1,
  }
}

const undo = (type) => async (_, thunkApi) => {
  const base = type === 'sqr' ? apiSqr : apiNgram
  const { undos } = thunkApi.getState()[type]
  const undo = [...undos].pop()
  thunkApi.dispatch(base.move({...undo, undo: true}))
  return undos.slice(0, -1)
}
const fillUndo = (state, action) => {
  state.undos = action.payload
}

const move = (type) => async (terms, thunkApi) => {
  const {
    params,
    groups,
    filters,
    view,
    summary,
    undos,
  } = thunkApi.getState()[type]

  let data = []
  let undo = false
  const config = {
    params: {
      report_type: type,
      business_id: groups.business_id,
    }
  }

  if (typeof terms === 'object') {
    if (!terms.term) throw Error("No term to move")
    if (terms.status === undefined) throw Error("No bucket to move")
    undo = terms.undo
    data.push(terms)
  } else if (Array.isArray(terms)) {
    data = terms
  } else {
    config.params = {
      ...params,
      ...groups,
      ...filters,
    }
    config.headers = { 'Content-Type': 'text/plain' }
    data = String(terms)
  }

  const results = await api.post('/terms/update', data, config)

  let undoStack = (undos || []).filter(undo => (
    !results.some(d => d.term === undo.term)
  ))

  if (!undo) undoStack = [
    ...undoStack,
    ...results,
  ]

  const current_view = results[0]?.status || 0
  let rview = results.map(r => r.term)
  rview = view.filter(item => !rview.includes(item.term))

  const s = [...summary]
  let slugs = []

  if (Array.isArray(data)) {
    s.forEach((el, idx) => {
      if (el.status === current_view) {
        s[idx] = {...el}
        s[idx].count -= 1
      }
    })

    data.forEach((item) => {
      s.forEach((el, idx) => {
        if (el.status === item.status) {
          s[idx] = {...el}
          s[idx].count += 1
        }
      })
      slugs.includes(item.status) || slugs.push(item.status)
    })
  } else {
    s.forEach((el, idx) => {
      if (el.status === data) {
        s[idx] = {...el}
        s[idx].count += 1
      }
    })
    slugs.includes(data) || slugs.push(data)
  }
  slugs = slugs.map(status => (
    getSlug(groups).replace(/.$/, status)
  ))

  const base = type === 'sqr' ? apiSqr : apiNgram
  thunkApi.dispatch(base.fetch('force'))

  return {
    view: rview,
    summary: s,
    slugs,
    undoStack,
  }
}
const fillMove = (state, action) => {
  if (!action.payload) return
  const {
    view,
    summary,
    slugs,
    undoStack,
  } = action.payload

  if (!Array.isArray(view)) return
  state.view = [...view]

  if (!Array.isArray(summary)) return
  state.summary = [...summary]

  if (!Array.isArray(slugs)) return
  slugs.forEach(slug => state.indexes[slug] = {
    data: {},
    views: {},
  })

  if (!Array.isArray(undoStack)) return
  state.undos = [ ...undoStack ]
}

const exportXls = (type) => async (_, thunkApi) => {
  const { params, filters, groups } = thunkApi.getState()[type]

  return {
    name: `terms_${type}.xls`,
    blob: await api({
      method: 'get',
      url: `/terms/export`,
      responseType: 'blob',
      params: {
        ...params,
        ...filters,
        ...groups,
      },
    })
  }
}
const fillExport = (state, action) => {
  if (!action.payload) return
  const url = window.URL.createObjectURL(action.payload.blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", action.payload.name)
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const exportNgram = createAsyncThunk('ngram/export', exportXls('ngram'))
const moveNgram = createAsyncThunk('ngram/move', move('ngram'))
const undoNgram = createAsyncThunk('ngram/undo', undo('ngram'))

export const apiNgram= index({
  objectName: 'terms',
  storeName: 'ngram',
  defaultApiParams: {
    report_type: 'ngram',
    page_size: 10,
  },
  defaultGroups: Terms.groups,
  defaultFilters: {
    ...Terms.filters,
    term_word_count: []
  },
  getId: item => item?.term,
  easyFilterCheck: true,

  export: exportNgram,
  move: moveNgram,
  undo: undoNgram,

  reducers: [
    { action: exportNgram.fulfilled, callback: fillExport},
    { action: moveNgram.fulfilled, callback: fillMove},
    { action: undoNgram.fulfilled, callback: fillUndo},
  ],
})

const downloadNegativeKeywords = createAsyncThunk(
  `sqr/negative_keywords`,
  async (includeDisabled, thunkApi) => {
    const payload = {}
    if (includeDisabled) payload[includeDisabled] = 1

    const { groups } = thunkApi.getState().sqr

    return {
      name: 'negative_keywords.xlsx',
      blob: await api({
        method: 'post',
        url: `/businesses/${groups.business_id}/negative_keywords`,
        data: payload,
        responseType: 'blob',
      })
    }
  }
)

const sync = createAsyncThunk(
  'sqr/sync',
  async (full, thunkApi) => {
    const { groups } = thunkApi.getState().sqr

    const payload = {
      businessId: groups.business_id,
      keywordsOnly: full ? true : false,
      type: 'sqr',
    }

    const parse = (response) => {
      if (!response._id) throw Error('No sync ID')
      if (!['started', 'succeed'].includes(response.status)) throw Error('Sync error')
      if (response.status === 'succeed') return true

      return response._id
    }

    const id = parse(await api.post('/syncs', payload))

    for (let i = 1; i <= 120; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const response = await api.get(`/syncs/${id}?attempt=${i}`)
      if (parse(response) === true) {
        thunkApi.dispatch(apiNgram.fetch('force'))
        thunkApi.dispatch(apiSqr.fetch('force'))
        thunkApi.dispatch(apiSqrScore.fetch('force'))
        thunkApi.dispatch(apiSqrStandard.fetch('force'))
        return response.date
      }
    }
  }
)
const fillSync = (state, action) => {
  if (!action.payload) return
  state.sync_in_progress = false
  state.sync_date = action.payload
}

const exportSqr = createAsyncThunk('sqr/export', exportXls('sqr'))
const moveSqr = createAsyncThunk('ngram/move', move('sqr'))
const undoSqr = createAsyncThunk('ngram/undo', undo('sqr'))

export const apiSqr = index({
  objectName: 'terms',
  storeName: 'sqr',
  defaultApiParams: {
    report_type: 'sqr',
    page_size: 100,
  },
  defaultGroups: Terms.groups,
  defaultFilters: Terms.filters,
  getId: item => item?.term,
  easyFilterCheck: true,

  downloadNegativeKeywords,
  sync,
  export: exportSqr,
  move: moveSqr,
  undo: undoSqr,

  reducers: [
    { action: downloadNegativeKeywords.fulfilled, callback: fillExport},
    { action: sync.pending, callback: (state) => { state.sync_in_progress = true }},
    { action: sync.fulfilled, callback: fillSync},
    { action: exportSqr.fulfilled, callback: fillExport},
    { action: moveSqr.fulfilled, callback: fillMove},
    { action: undoSqr.fulfilled, callback: fillUndo},
  ],
})

export const apiSqrScore = index({
  objectName: 'reports/score_metric_percents',
  useCache: false,
  defaultGroups: {
    business_id: null,
  }
})

const updateSqrStandard = createAsyncThunk(
  `sqr_standard/update`,
  async (payload, thunkApi) => {
    const { groups } = thunkApi.getState().sqr_standard
    return api.post(`/businesses/${groups.business_id}/sqr_standard`, payload)
  }
)
const fillUpdateSqrStandard = (state, action) => {
  if (!action.payload) return
  state.view.standard = action.payload
}

export const apiSqrStandard = index({
  objectName: 'reports/sqr_standard',
  useCache: false,
  defaultGroups: {
    business_id: null,
  },
  reducers: [
    { action: updateSqrStandard.fulfilled, callback: fillUpdateSqrStandard },
  ],
  update: updateSqrStandard,
})
