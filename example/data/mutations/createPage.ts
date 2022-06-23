import { gql } from '@apollo/client';
export const MUTATION = gql`mutation createPage($CreatePageRequestSchema: CreatePageRequestSchema!){
    createPage(CreatePageRequestSchema: $CreatePageRequestSchema){
        bookId
        createdTime
        pageElement{
            bookId
            createdTime
            lSize{
                height
                width
            }
            hSize{
                height
                width
            }
            pageIndex
            updatedTime
        }
        pageIndex
        pageName
        updatedTime
    }
}`