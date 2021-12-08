import index from './react-index'
import api from './api'

export const apiBusiness = index({
  api,
  objectName: 'businesses',
  defaultFilters: {
    status: 'active',
  },
})

export const apiUsers = index({
  api,
  objectName: 'users',
  storeName: 'api_users',
  defaultFilters: {
    status: 'active',
  },
})

export const apiSummaries = index({
  api,
  objectName: 'summaries',
  idParam: 'business_id',
  defaultApiParams: {
    with_sub_summaries: true,
  },
  defaultGroups: {
    month: new Date().toISOString().slice(0, 7),
  },
  defaultFilters: {
    orderKey: null,
    manager_id: null,
    q: "",
    page: 1,
  },
  getId: item => item?.model?._id
})

export const apiTasks = index({
  api,
  objectName: 'tasks',
  defaultGroups: {
    group_by: null,
  },
  defaultFilters: {
    business: null,
    due_date: null,
    exact: null,
    priority: null,
    setup: false,
    status: 'incomplete',
    assignee: null,
    waiting_on: null,
    // group_by: 'due_date',
    order_by: [],
    type: 'task',
    filters: ["watched","assigned","waiting","created","made_owner"],
    // filters: [],
    template: false,
    q: "",
    page: 1,
  },
})

export const apiAccounts = index({
  api,
  objectName: 'accounts',
  defaultFilters: {
    status: 'active',
    business_id: null,
    type: null,
  },
})
