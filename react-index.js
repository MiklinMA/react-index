import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import qs from 'query-string';
import api from './api'
import axios from 'axios'

export const getSlug = (object) => {
    return Object.values(object).map(v => v || String(v)).join('/') || 'default'
}

const createApi = ({
  objectName,
  storeName,
  idParam,
  idsParam,
  defaultApiParams,
  defaultFilters,
  defaultGroups,
  getId,
  easyFilterCheck,
  useCache,
  reducers,
  ...rest
}) => {
  if (!objectName) throw Error("objectName MUST be specified")
  if (!storeName) {
    storeName = objectName.split('/').pop()
  }
  defaultApiParams = defaultApiParams || {}
  defaultFilters = defaultFilters || {}
  defaultGroups = defaultGroups || {}
  getId = getId || (item => item?._id)
  reducers = reducers || []
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
      if (!ez && o[k] === undefined) return
      if (String(o[k]) === decodeURI(v)) return

      o[k] = v
      diffs = true
      return true
    }

    if (Object.keys(action?.payload || {}).length) {
      Object.entries(action.payload).forEach(([k, v]) => {
        if (!check(state.groups, k, v))
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
  const resetQuery = (state) => {
    const params = Object.entries({
      ...state.groups,
      ...state.filters,
    }).reduce((a, [k, v]) => {
      v !== undefined && (a[k] = v)
      return a
    }, {})

    state.query = qs.stringify(params)
  }
  const resetGroups = (state) => {
    state.groups = { ...state.defaults.groups }
    resetQuery(state)
  }

  const apiFetchOne = async (id) => {
      let url = objectName
      const params = { ...defaultApiParams }
      if (idParam) params[idParam] = id
      else url += `/${id}`

      const result = await api.get(url, {params})
      return result?.results || result
  }

  let cancelList
  const apiFetchList = async (groups, filters) => {
    if (cancelList !== undefined) cancelList()
    const f = {
      ...groups,
      ...filters,
    }
    Object.entries(f).forEach(([k, v]) => {
      if (v === null) return
      if (typeof v === "object") f[k] = JSON.stringify(v)
      else f[k] = v
    })

    return api.get(objectName, {
      params: {
        ...defaultApiParams,
        ...f,
      },
      cancelToken: new axios.CancelToken(
        function executor(c) { cancelList = c }
      )
    })
  }

  const fetchOne = createAsyncThunk(
    `${storeName}/item`,
    async (payload, thunkApi) => {
      let result, id, force

      if (typeof payload === 'object') {
        id = payload.id
        force = payload.force
      } else {
        id = payload
        force = false
      }
      if (!id) throw Error("Empty ID")

      if (!force) {
        const { indexes, groups } = thunkApi.getState()[storeName]
        const index = indexes[getSlug(groups)]
        result = index?.data?.[id]
        if (result) return result
      }

      result = await apiFetchOne(id)
      return result?.[0] || result
    },
  )

  const fillOne = (state, action) => {
    if (!action.payload) return
    if (action.payload === true) return

    state.selected = action.payload

    const group = getSlug(state.groups)
    let index = state.indexes[group]
    if (!index) {
      index = state.indexes[group] = {
        data: {},
        views: {},
      }
    }
    const id = getId(state.selected)
    index.data[id] = index.data[id] && state.selected
    state.data[id] = state.data[id] && state.selected
    state.view.forEach((item, i) => {
      if (getId(item) === getId(state.selected)) state.view[i] = state.selected
    })
  }

  const fetchData = createAsyncThunk(
    `${storeName}/view`,
    async (type, thunkApi) => {
      const { indexes, filters, groups, checked } = thunkApi.getState()[storeName]

      const index = indexes[getSlug(groups)]
      const view = index?.views?.[getSlug(filters)]

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

      if (type === 'checked' && index) {
        const ids = checked.filter(id => !index.data?.[id])
        // console.log('fetch', ids)
        if (!ids.length) return
        if (idsParam) {
        } else {
          ids.map(id => thunkApi.dispatch(fetchOne(id)))
        }
        return
      }

      return apiFetchList(groups, filters)
    }
  )

  const fillData = (state, action) => {
    state.status = 'idle'
    if (!action.payload) return

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

    if (action.payload?.checked) return
    else state.view = payload

    if (action.payload?.cache) return

    // Filters
    const filter = getSlug(state.filters)
    index.views[filter] = {
      ...view,
      data: Object.values(payload).map(getId),
    }

    state.selected = null
  }

  const errorData = (state, action) => {
    console.error(action.error?.message)
    state.status = "error"
  }

  const cleanUp = (state) => {
    Object.entries(initialState).forEach(([k, v]) => {
      if ([
        'filters',
        'groups',
        'params',
        'query',
        'defaults',
      ].includes(k)) return

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
      },
  }

  const slice = createSlice({
    name: storeName,
    initialState,
    reducers: {
      filter: setFilter,
      check: checkId,
      clean: cleanUp,
      resetGroups,
    },
    extraReducers: (builder) => {
      builder
        .addCase(fetchData.pending, (state) => { state.status = 'loading' })
        .addCase(fetchData.rejected, errorData)
        .addCase(fetchData.fulfilled, fillData)
        // .addCase(fetchOne.pending, (state, action) => { console.log('pending', action) })
        // .addCase(fetchOne.rejected, (state, action) => { console.log('rejected', action) })
        .addCase(fetchOne.fulfilled, fillOne)
      reducers.forEach(reducer => {
        builder.addCase(reducer.action, reducer.callback)
      })
    },
  })

  return {
    state: (state) => state[storeName],
    reducer: slice.reducer,
    ...slice.actions,

    select: fetchOne,
    get: (id) => fetchOne({id, force: true}),

    fetch: fetchData,

    ...rest,
  }
}

export default createApi
