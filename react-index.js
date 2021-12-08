import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import axios from 'axios'

export const getSlug = object => {
  return (
    Object.values(object)
      .map(v => v || String(v))
      .join('/') || 'default'
  )
}

const createApi = ({
  api,
  objectName,
  storeName,
  idParam,
  idsParam,
  defaultApiParams,
  defaultFilters,
  defaultGroups,
  getId,
  selectCheck,
  easyFilterCheck,
  useCache,
  reducers,
  extraReducers,
  ...rest
}) => {
  if (!objectName) throw Error('objectName MUST be specified')
  if (!storeName) {
    storeName = objectName.split('/').pop()
  }
  defaultApiParams = defaultApiParams || {}
  defaultFilters = defaultFilters || {}
  defaultGroups = defaultGroups || {}
  getId = getId || (item => item?._id)
  reducers = reducers || {}
  extraReducers = extraReducers || []
  useCache = useCache === undefined ? true : useCache

  const checkId = (state, action) => {
    const id = action?.payload
    if (!id) return
    if (state.status !== 'idle') return
    if (state.data[id]) return
    if (state.checked.includes(id)) return

    // console.log('check', id)
    state.checked.push(id)
  }

  const setFilter = (state, action) => {
    let diffs = !Boolean(state.query)

    const check = (o, k, v, ez) => {
      const found = o[k] !== undefined
      if (!ez && o[k] === undefined) return found
      if (String(o[k]) === decodeURI(v)) return found

      o[k] = v === undefined ? null : v
      diffs = true
      return found
    }

    if (Object.keys(action?.payload || {}).length) {
      Object.entries(action.payload).forEach(([k, v]) => {
        if (check(state.params, k, v)) return
        if (check(state.groups, k, v)) return
        check(state.filters, k, v, easyFilterCheck)
      })
    } else {
      diffs = true
      // state.groups = { ...state.defaults.groups }
      state.filters = { ...state.defaults.filters }
    }

    if (diffs) {
      resetQuery(state)
    }
  }
  const resetQuery = state => {
    const params = Object.entries({
      ...state.groups,
      ...state.filters,
    }).reduce((a, [k, v]) => {
      v !== undefined && (a[k] = v)
      return a
    }, {})

    state.query = new URLSearchParams(params).toString()
  }
  const resetGroups = state => {
    state.groups = { ...state.defaults.groups }
    resetQuery(state)
  }

  const getParams = (params, groups, filters) => {
    const f = {
      ...(params || {}),
      ...(groups || {}),
      ...(filters || {}),
    }
    Object.entries(f).forEach(([k, v]) => {
      if (v === null) return
      if (typeof v === 'object') f[k] = JSON.stringify(v)
      else f[k] = v
    })
    return f
  }

  const apiFetchOne = async (id, params, groups) => {
    let url = objectName
    const args = getParams(params, groups)
    if (idParam) args[idParam] = id
    else url += `/${id}`

    const result = await api.get(url, { params: args })
    return result?.results || result
  }

  let cancelList
  const apiFetchList = async (params, groups, filters) => {
    if (cancelList !== undefined) cancelList()

    return api.get(objectName, {
      params: getParams(params, groups, filters),
      cancelToken: new axios.CancelToken(function executor(c) {
        cancelList = c
      }),
    })
  }

  const fetchOne = createAsyncThunk(`${storeName}/item`, async (payload, thunkApi) => {
    let result, id, force

    if (!payload) {
      return null
    } else if (typeof payload === 'object') {
      id = payload.id
      force = payload.force
    } else {
      id = payload
      force = false
    }
    if (!id) throw Error('Empty ID')

    const { indexes, params, groups } = thunkApi.getState()[storeName]
    if (!force) {
      const index = indexes[getSlug(groups)]
      result = index?.data?.[id]
      if (result) {
        if (!selectCheck || selectCheck(result)) {
          return result
        }
      }
    }

    result = await apiFetchOne(id, params, groups)
    return result?.[0] || result
  })

  const fillOne = (state, action) => {
    state.status = 'idle'
    if (action.payload === true) return
    if (action.payload === null) {
      state.selected = null
      return
    }
    if (!action.payload) return

    const id = getId(action.payload)

    if (!state.checked.includes(id)) {
      state.selected = action.payload
    }

    const group = getSlug(state.groups)
    let index = state.indexes[group]
    if (!index) {
      index = state.indexes[group] = {
        data: {},
        views: {},
      }
    }
    index.data[id] = action.payload
    state.data[id] = action.payload
    state.view.forEach((item, i) => {
      if (getId(item) === id) state.view[i] = action.payload
    })
  }

  const fetchData = createAsyncThunk(`${storeName}/view`, async (type, thunkApi) => {
    const {
      indexes, checked,
      params, filters, groups,
    } = thunkApi.getState()[storeName]

    const index = indexes[getSlug(groups)]
    const view = index?.views?.[getSlug(filters)]

    if (type === 'checked' && index) {
      const ids = checked.filter(id => !index.data?.[id])
      // console.log('fetch', ids)
      if (!ids.length) {
        throw Error('empty list')
      }
      if (idsParam) {
        // fetch by idsParams
      } else {
        await Promise.all(ids.map(id => thunkApi.dispatch(fetchOne(id))))
      }
      return 'checked'
    }

    if (useCache && type !== 'force' && view) {
      if (view.data?.length) {
        const results = view.data.map(item => index?.data?.[item])
        if (results.length) {
          if (cancelList !== undefined) cancelList()
          return {
            ...view,
            results,
            cache: true,
          }
        }
      }
    }

    return apiFetchList(params, groups, filters)
  })

  const fillData = (state, action) => {
    if (!action.payload) {
      state.status = 'idle'
      return
    }
    if (action.payload === 'checked') {
      state.status = 'idle'
      state.checked = []
      return
    }

    let payload, view
    // UNSAFE
    // Fill state with all data from payload
    // not only results (ex. SQR summary)
    if (action.payload?.results) {
      payload = action.payload.results
      delete action.payload?.results
      Object.keys(action.payload).forEach(key => {
        if (['cache'].includes(key)) return
        state[key] = action.payload[key]
      })
      view = action.payload
    } else {
      payload = action.payload
      view = {}
    }

    // Groups
    const group = getSlug(state.groups)
    let index = state.indexes[group]
    if (!index) {
      index = state.indexes[group] = {
        data: {},
        views: {},
      }
    }

    if (Array.isArray(payload)) {
      payload.forEach(item => {
        const id = getId(item)
        index.data[id] = index.data[id] || item
      })
    }
    state.data = index.data
    state.view = payload

    if (action.payload?.cache) {
      state.status = 'idle'
      return
    }

    // Filters
    const filter = getSlug(state.filters)
    index.views[filter] = {
      ...view,
      data: Object.values(payload).map(getId),
    }

    // state.selected = null
    state.status = 'idle'
  }

  const errorData = (state, action) => {
    if (action.error?.message === 'Rejected') return
    console.error(action.error)
    state.status = 'error'
  }

  const cleanUp = (state, action) => {
    const exclude = ['filters', 'groups', 'params', 'query', 'defaults']

    Object.entries(initialState).forEach(([k, v]) => {
      if (exclude.includes(k)) return
      if (action?.payload && !action.payload.includes(k)) return

      state[k] = v
    })
  }

  const initialState = {
    status: 'idle',
    data: {},
    view: [],
    selected: null,

    pagination: {},
    indexes: {},
    checked: [],

    filters: defaultFilters,
    groups: defaultGroups,
    params: defaultApiParams,
    query: '',

    defaults: {
      filters: defaultFilters,
      groups: defaultGroups,
      params: defaultApiParams,
    },
  }

  const slice = createSlice({
    name: storeName,
    initialState,
    reducers: {
      load: (state) => { state.status = 'loading' },
      filter: setFilter,
      check: checkId,
      clean: cleanUp,
      resetGroups,
      ...reducers,
    },
    extraReducers: builder => {
      builder
        .addCase(fetchData.pending, state => {
          // state.view = []
          if (state.checked?.length) return
          state.status = 'loading'
        })
        .addCase(fetchData.rejected, errorData)
        .addCase(fetchData.fulfilled, fillData)
        // .addCase(fetchOne.pending, (state, action) => { console.log('pending', action) })
        // .addCase(fetchOne.rejected, (state, action) => { console.log('rejected', action) })
        .addCase(fetchOne.pending, (state, action) => {
          // state.selected = null
          if (state.checked?.length) return
          if (!action.meta?.arg) return
          state.status = 'loading_one'
        })
        .addCase(fetchOne.fulfilled, fillOne)
      extraReducers.forEach(reducer => {
        builder.addCase(reducer.action, reducer.callback)
      })
    },
  })

  return {
    root: state => state,
    state: state => state[storeName],
    store: callback => state => {
      if (callback) return callback(state[storeName])
      return state[storeName]
    },
    stateCustom: path => state => {
      let part = state[storeName]
      path.split('.').some(k => {
        if (!part) return true
        part = part[k]
        return false
      })
      return part
    },
    reducer: slice.reducer,
    ...slice.actions,

    select: fetchOne,
    get: id => fetchOne({ id, force: true }),

    fetch: fetchData,

    ...rest,
  }
}

export default createApi

